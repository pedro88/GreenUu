import { and, asc, desc, eq, gt, inArray, isNull } from 'drizzle-orm';
import { conflict, DomainError, forbidden, notFound } from '@/lib/errors';
import { addDays } from '@/lib/dates';
import { hashToken, newToken } from '@/lib/tokens';
import type { ScopedCtx, ServiceCtx } from '@/server/action-core';
import { assertCan, type Scope } from '@/server/authz/scope';
import { assignableRoles, canManageMember, type Role } from '@/server/authz/permissions';
import type { Executor } from '@/server/db/client';
import { garden, gardenGroup, gardenInvitation, gardenMember, groupMember, user, userProfile } from '@/server/db/schema';
import { emit } from '@/server/events/emit';
import { invitationMail, memberLeftMail } from '@/server/mail/templates';
import { notify } from '../notification/service';
import { unassignMember } from '../ticket/service';
import type { InviteInput } from './schema';

export const INVITATION_TTL_DAYS = 7;
export const MEMBER_LIST_LIMIT = 1000;

const ROLE_LABELS: Record<Role, string> = { owner: 'propriétaire', admin: 'admin', member: 'membre', observer: 'observateur·rice' };

/** RG-INV-01 à 03 : invitation par e-mail, une seule active par adresse ; e-mail envoyé via la file. */
export async function invite(ctx: ScopedCtx, input: InviteInput) {
  const { tx, scope, actor, clock, jobs, appUrl } = ctx;
  assertCan(scope, 'member:invite');
  if (!assignableRoles(scope.role).includes(input.role)) throw forbidden('roleNotAssignable');
  const [already] = await tx.select({ id: gardenMember.id }).from(gardenMember).innerJoin(user, eq(user.id, gardenMember.userId))
    .where(and(eq(gardenMember.gardenId, scope.gardenId), eq(user.email, input.email), isNull(gardenMember.leftAt))).limit(1);
  if (already) throw conflict('alreadyMember');
  await assertGroupsInGarden(tx, scope, input.groupIds);
  const now = clock.now();
  // RG-INV-02 : réinviter révoque l'invitation précédente.
  await tx.update(gardenInvitation).set({ revokedAt: now }).where(and(
    eq(gardenInvitation.gardenId, scope.gardenId), eq(gardenInvitation.email, input.email),
    isNull(gardenInvitation.acceptedAt), isNull(gardenInvitation.revokedAt),
  ));
  const { token, hash } = newToken();
  const [inv] = await tx.insert(gardenInvitation).values({
    gardenId: scope.gardenId, email: input.email, role: input.role, tokenHash: hash,
    invitedBy: actor.id, groupIds: input.groupIds, expiresAt: addDays(now, INVITATION_TTL_DAYS),
  }).returning({ id: gardenInvitation.id });
  if (!inv) throw new Error("Insertion de l'invitation échouée");
  const [g] = await tx.select({ name: garden.name }).from(garden).where(eq(garden.id, scope.gardenId)).limit(1);
  await jobs.enqueue('mail.send', invitationMail({
    to: input.email, gardenName: g?.name ?? '', inviterName: await displayName(tx, actor.id, actor.name),
    roleLabel: ROLE_LABELS[input.role], url: `${appUrl}/invitation/${token}`,
  }));
  await emit(tx, { type: 'invitation.sent', subjectType: 'invitation', subjectId: inv.id, gardenId: scope.gardenId, actorId: actor.id, payload: { role: input.role } }, now);
  return { invitationId: inv.id };
}

export async function revokeInvitation(ctx: ScopedCtx, invitationId: string) {
  const { tx, scope, actor, clock } = ctx;
  assertCan(scope, 'member:invite');
  const rows = await tx.update(gardenInvitation).set({ revokedAt: clock.now() }).where(and(
    eq(gardenInvitation.id, invitationId), eq(gardenInvitation.gardenId, scope.gardenId),
    isNull(gardenInvitation.acceptedAt), isNull(gardenInvitation.revokedAt),
  )).returning({ id: gardenInvitation.id });
  if (rows.length === 0) throw notFound('invitationNotFound');
  await emit(tx, { type: 'invitation.revoked', subjectType: 'invitation', subjectId: invitationId, gardenId: scope.gardenId, actorId: actor.id, payload: {} }, clock.now());
  return { invitationId };
}

export type InvitationPreview =
  | { status: 'valid'; gardenName: string; inviterName: string; role: Role; email: string }
  | { status: 'invalid' };

/** Aperçu public d'une invitation par jeton : aucune donnée du jardin si elle est invalide (INV-04). */
export async function previewInvitation(tx: Executor, token: string, now: Date): Promise<InvitationPreview> {
  const inv = await findValidInvitation(tx, token, now);
  if (!inv) return { status: 'invalid' };
  return { status: 'valid', gardenName: inv.gardenName, inviterName: await displayName(tx, inv.invitedBy, ''), role: inv.role, email: inv.email };
}

async function findValidInvitation(tx: Executor, token: string, now: Date) {
  const [inv] = await tx.select({
    id: gardenInvitation.id, gardenId: gardenInvitation.gardenId, email: gardenInvitation.email, role: gardenInvitation.role,
    groupIds: gardenInvitation.groupIds, invitedBy: gardenInvitation.invitedBy, gardenName: garden.name,
  }).from(gardenInvitation).innerJoin(garden, eq(garden.id, gardenInvitation.gardenId)).where(and(
    eq(gardenInvitation.tokenHash, hashToken(token)), isNull(gardenInvitation.acceptedAt), isNull(gardenInvitation.revokedAt),
    gt(gardenInvitation.expiresAt, now), isNull(garden.deletedAt),
  )).limit(1);
  return inv ?? null;
}

/**
 * RG-INV-04 / 05 : acceptation par l'utilisateur connecté dont l'e-mail correspond.
 * Le lien prouve la possession de l'adresse : l'e-mail est marqué vérifié.
 */
export async function acceptInvitation(ctx: ServiceCtx, token: string) {
  const { tx, actor, clock } = ctx;
  const now = clock.now();
  const inv = await findValidInvitation(tx, token, now);
  if (!inv) throw new DomainError('NOT_FOUND', 'invitationInvalid');
  if (inv.email.toLowerCase() !== actor.email.toLowerCase()) throw forbidden('invitationOtherEmail');
  const [active] = await tx.select({ id: gardenMember.id }).from(gardenMember)
    .where(and(eq(gardenMember.gardenId, inv.gardenId), eq(gardenMember.userId, actor.id), isNull(gardenMember.leftAt))).limit(1);
  if (active) throw conflict('alreadyMember');
  const [m] = await tx.insert(gardenMember).values({ gardenId: inv.gardenId, userId: actor.id, role: inv.role, joinedAt: now }).returning({ id: gardenMember.id });
  if (!m) throw new Error('Insertion du membre échouée');
  const groups = inv.groupIds.length === 0 ? [] : await tx.select({ id: gardenGroup.id }).from(gardenGroup)
    .where(and(eq(gardenGroup.gardenId, inv.gardenId), inArray(gardenGroup.id, inv.groupIds), isNull(gardenGroup.archivedAt)));
  if (groups.length > 0) await tx.insert(groupMember).values(groups.map((g) => ({ gardenId: inv.gardenId, groupId: g.id, memberId: m.id })));
  await tx.update(gardenInvitation).set({ acceptedAt: now, acceptedBy: actor.id }).where(eq(gardenInvitation.id, inv.id));
  if (!actor.emailVerified) await tx.update(user).set({ emailVerified: true }).where(eq(user.id, actor.id));
  await emit(tx, { type: 'invitation.accepted', subjectType: 'invitation', subjectId: inv.id, gardenId: inv.gardenId, actorId: actor.id, payload: { userId: actor.id } }, now);
  await emit(tx, { type: 'member.joined', subjectType: 'member', subjectId: m.id, gardenId: inv.gardenId, actorId: actor.id, payload: { userId: actor.id, role: inv.role, via: 'invitation' } }, now);
  return { gardenId: inv.gardenId };
}

/** Changement de rôle (§5.2) : un admin n'agit que sur member/observer ; personne ne touche l'owner. */
export async function changeRole(ctx: ScopedCtx, memberId: string, role: Exclude<Role, 'owner'>) {
  const { tx, scope, actor, clock } = ctx;
  assertCan(scope, 'member:change_role');
  const target = await findActiveMember(tx, scope, memberId);
  if (!canManageMember(scope.role, target.role) || !assignableRoles(scope.role).includes(role)) throw forbidden();
  await tx.update(gardenMember).set({ role }).where(eq(gardenMember.id, target.id));
  await emit(tx, { type: 'member.role_changed', subjectType: 'member', subjectId: target.id, gardenId: scope.gardenId, actorId: actor.id, payload: { userId: target.userId, from: target.role, to: role } }, clock.now());
  return { memberId };
}

/** RG-MBR-01 / 02 : retrait par un admin ou l'owner. */
export async function removeMember(ctx: ScopedCtx, memberId: string) {
  const { tx, scope } = ctx;
  assertCan(scope, 'member:remove');
  const target = await findActiveMember(tx, scope, memberId);
  if (target.id === scope.memberId) throw new DomainError('VALIDATION', 'useLeaveInstead');
  if (!canManageMember(scope.role, target.role)) throw forbidden();
  return endMembership(ctx, target, ctx.actor.id);
}

/** RG-MBR-03 : l'owner ne peut pas partir sans transférer la propriété. */
export async function leave(ctx: ScopedCtx) {
  const { tx, scope } = ctx;
  if (scope.role === 'owner') throw forbidden('ownerMustTransfer');
  assertCan(scope, 'member:leave');
  const self = await findActiveMember(tx, scope, scope.memberId);
  return endMembership(ctx, self, null);
}

async function endMembership(ctx: ScopedCtx, target: typeof gardenMember.$inferSelect, removedBy: string | null) {
  const { tx, scope, actor, clock, jobs, appUrl } = ctx;
  const now = clock.now();
  await tx.update(gardenMember).set({ leftAt: now, removedBy }).where(eq(gardenMember.id, target.id));
  await tx.delete(groupMember).where(eq(groupMember.memberId, target.id));
  // RG-MBR-02 : ses assignations directes aux tickets ouverts sont retirées.
  const unassignedTicketIds = await unassignMember(tx, scope.gardenId, target.id);
  const [g] = await tx.select({ name: garden.name }).from(garden).where(eq(garden.id, scope.gardenId)).limit(1);
  const admins = await tx.select({ email: user.email }).from(gardenMember).innerJoin(user, eq(user.id, gardenMember.userId)).where(and(
    eq(gardenMember.gardenId, scope.gardenId), isNull(gardenMember.leftAt), inArray(gardenMember.role, ['owner', 'admin']),
  ));
  const name = await displayName(tx, target.userId, '');
  for (const a of admins) {
    await jobs.enqueue('mail.send', memberLeftMail({ to: a.email, gardenName: g?.name ?? '', memberName: name, ticketCount: unassignedTicketIds.length, url: `${appUrl}/app/jardins/${scope.gardenId}/membres` }));
  }
  const adminIds = await tx.select({ id: gardenMember.userId }).from(gardenMember).where(and(
    eq(gardenMember.gardenId, scope.gardenId), isNull(gardenMember.leftAt), inArray(gardenMember.role, ['owner', 'admin']),
  ));
  await notify(tx, jobs, appUrl, {
    userIds: adminIds.map((a) => a.id), type: 'member_left_unassigned', gardenId: scope.gardenId, groupKey: target.id, actorId: actor.id, now,
    payload: { title: name, url: `/app/jardins/${scope.gardenId}/tickets`, excerpt: String(unassignedTicketIds.length) },
  });
  await emit(tx, { type: 'member.left', subjectType: 'member', subjectId: target.id, gardenId: scope.gardenId, actorId: actor.id, payload: { userId: target.userId, removedBy, unassignedTicketIds } }, now);
  return { memberId: target.id };
}

async function findActiveMember(tx: Executor, scope: Scope, memberId: string) {
  const [m] = await tx.select().from(gardenMember)
    .where(and(eq(gardenMember.id, memberId), eq(gardenMember.gardenId, scope.gardenId), isNull(gardenMember.leftAt))).limit(1);
  if (!m) throw notFound('memberNotFound');
  return m;
}

async function assertGroupsInGarden(tx: Executor, scope: Scope, groupIds: string[]) {
  if (groupIds.length === 0) return;
  const unique = [...new Set(groupIds)];
  const rows = await tx.select({ id: gardenGroup.id }).from(gardenGroup)
    .where(and(eq(gardenGroup.gardenId, scope.gardenId), inArray(gardenGroup.id, unique), isNull(gardenGroup.archivedAt)));
  if (rows.length !== unique.length) throw new DomainError('VALIDATION', 'groupNotFound', { groupIds: ['groupNotFound'] });
}

async function displayName(tx: Executor, userId: string, fallback: string): Promise<string> {
  const [p] = await tx.select({ pseudo: userProfile.pseudo, name: user.name }).from(user).leftJoin(userProfile, eq(userProfile.userId, user.id)).where(eq(user.id, userId)).limit(1);
  return p?.pseudo ?? p?.name ?? fallback;
}

/* ---------- Lectures ---------- */

/** Membres actifs et anciens (contributions conservées), invitations en attente (vue `/membres`). */
export async function listMembers(tx: Executor, scope: Scope, now: Date) {
  const members = await tx.select({
    id: gardenMember.id, userId: gardenMember.userId, role: gardenMember.role, joinedAt: gardenMember.joinedAt, leftAt: gardenMember.leftAt,
    pseudo: userProfile.pseudo, name: user.name,
  }).from(gardenMember).innerJoin(user, eq(user.id, gardenMember.userId)).leftJoin(userProfile, eq(userProfile.userId, user.id))
    .where(eq(gardenMember.gardenId, scope.gardenId)).orderBy(asc(userProfile.pseudo))
    // Plafond de sécurité : un jardin collectif compte quelques dizaines de membres (audit M5).
    .limit(MEMBER_LIST_LIMIT);
  const memberships = await tx.select({ memberId: groupMember.memberId, groupId: groupMember.groupId }).from(groupMember)
    .where(eq(groupMember.gardenId, scope.gardenId));
  const invitations = scope.role === 'owner' || scope.role === 'admin'
    ? await tx.select({ id: gardenInvitation.id, email: gardenInvitation.email, role: gardenInvitation.role, expiresAt: gardenInvitation.expiresAt, createdAt: gardenInvitation.createdAt })
      .from(gardenInvitation).where(and(eq(gardenInvitation.gardenId, scope.gardenId), isNull(gardenInvitation.acceptedAt), isNull(gardenInvitation.revokedAt), gt(gardenInvitation.expiresAt, now)))
      .orderBy(desc(gardenInvitation.createdAt))
    : [];
  const active = members.filter((m) => m.leftAt === null).map((m) => ({ ...m, groupIds: memberships.filter((g) => g.memberId === m.id).map((g) => g.groupId) }));
  const former = members.filter((m) => m.leftAt !== null && !active.some((a) => a.userId === m.userId));
  return { active, former, invitations };
}
