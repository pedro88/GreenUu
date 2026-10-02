/** Briques communes du ticketing : fuseau, cibles, assignations, chargement et faits pour la matrice. */
import { and, eq, inArray, isNull, ne } from 'drizzle-orm';
import { notFound, validation } from '@/lib/errors';
import { localDate } from '@/lib/dates';
import type { Scope } from '@/server/authz/scope';
import type { Executor } from '@/server/db/client';
import {
  culture, garden, gardenGroup, gardenMember, groupMember, ticket, ticketAssignee, ticketChecklistItem, ticketEvent, userProfile,
} from '@/server/db/schema';
import type { JobQueue } from '@/server/jobs/queues';
import { notify } from '../notification/service';
import { findZone } from '../zone/repo';
import { assertZoneContribute } from '../zone/service';

export const MATERIALIZE_HORIZON_DAYS = 14;
export const TICKET_LIST_LIMIT = 200;

export async function gardenTz(tx: Executor, gardenId: string) {
  const [g] = await tx.select({ timezone: garden.timezone }).from(garden).where(eq(garden.id, gardenId)).limit(1);
  return g?.timezone ?? 'Europe/Paris';
}
export async function gardenToday(tx: Executor, gardenId: string, now: Date) {
  return localDate(now, await gardenTz(tx, gardenId));
}

/** Zone concernée par le rattachement (pour les restrictions de zone), en validant la cible dans le jardin. */
export async function targetZoneId(tx: Executor, scope: Scope, t: { zoneId?: string | null | undefined; cultureId?: string | null | undefined }): Promise<string | null> {
  if (t.zoneId && t.cultureId) throw validation({ zoneId: ['oneTarget'] });
  if (t.cultureId) {
    const [c] = await tx.select({ zoneId: culture.zoneId }).from(culture)
      .where(and(eq(culture.gardenId, scope.gardenId), eq(culture.id, t.cultureId), isNull(culture.deletedAt))).limit(1);
    if (!c) throw notFound('cultureNotFound');
    return c.zoneId;
  }
  if (t.zoneId) return (await findZone(tx, scope, t.zoneId)).id;
  return null;
}

/** Cibles d'assignation valides : membres actifs non observateurs, groupes actifs (RG-TCK-04). */
export async function assertAssignees(tx: Executor, scope: Scope, memberIds: string[], groupIds: string[]) {
  const m = [...new Set(memberIds)];
  const g = [...new Set(groupIds)];
  if (m.length) {
    const rows = await tx.select({ id: gardenMember.id }).from(gardenMember)
      .where(and(eq(gardenMember.gardenId, scope.gardenId), inArray(gardenMember.id, m), isNull(gardenMember.leftAt), ne(gardenMember.role, 'observer')));
    if (rows.length !== m.length) throw validation({ memberIds: ['assigneeInvalid'] });
  }
  if (g.length) {
    const rows = await tx.select({ id: gardenGroup.id }).from(gardenGroup)
      .where(and(eq(gardenGroup.gardenId, scope.gardenId), inArray(gardenGroup.id, g), isNull(gardenGroup.archivedAt)));
    if (rows.length !== g.length) throw validation({ groupIds: ['groupNotFound'] });
  }
  return { memberIds: m, groupIds: g };
}

/** Utilisateurs couverts par des assignations (membres directs + membres actifs des groupes). */
export async function usersOf(tx: Executor, memberIds: string[], groupIds: string[]): Promise<string[]> {
  const direct = memberIds.length ? await tx.select({ u: gardenMember.userId }).from(gardenMember).where(and(inArray(gardenMember.id, memberIds), isNull(gardenMember.leftAt))) : [];
  const viaGroups = groupIds.length ? await tx.select({ u: gardenMember.userId }).from(groupMember).innerJoin(gardenMember, eq(gardenMember.id, groupMember.memberId))
    .where(and(inArray(groupMember.groupId, groupIds), isNull(gardenMember.leftAt))) : [];
  return [...new Set([...direct, ...viaGroups].map((r) => r.u))];
}

export async function assigneesOf(tx: Executor, ticketId: string) {
  const rows = await tx.select({ memberId: ticketAssignee.memberId, groupId: ticketAssignee.groupId }).from(ticketAssignee).where(eq(ticketAssignee.ticketId, ticketId));
  return { memberIds: rows.flatMap((r) => (r.memberId ? [r.memberId] : [])), groupIds: rows.flatMap((r) => (r.groupId ? [r.groupId] : [])) };
}

export async function actorName(tx: Executor, userId: string) {
  const [p] = await tx.select({ pseudo: userProfile.pseudo }).from(userProfile).where(eq(userProfile.userId, userId)).limit(1);
  return p?.pseudo ?? '';
}

export const ticketUrl = (gardenId: string, id: string) => `/app/jardins/${gardenId}/tickets/${id}`;

export async function notifyAssigned(ctx: { tx: Executor; jobs: JobQueue; appUrl: string; clock: { now(): Date }; actor: { id: string } }, scope: Scope, t: { id: string; title: string }, memberIds: string[], groupIds: string[]) {
  const users = await usersOf(ctx.tx, memberIds, groupIds);
  await notify(ctx.tx, ctx.jobs, ctx.appUrl, {
    userIds: users, type: 'assigned', gardenId: scope.gardenId, groupKey: t.id, actorId: ctx.actor.id, now: ctx.clock.now(),
    payload: { title: t.title, url: ticketUrl(scope.gardenId, t.id), actorName: await actorName(ctx.tx, ctx.actor.id) },
  });
}

export async function insertTicket(tx: Executor, values: typeof ticket.$inferInsert, checklist: string[], memberIds: string[], groupIds: string[]) {
  const [t] = await tx.insert(ticket).values(values).onConflictDoNothing().returning({ id: ticket.id, title: ticket.title });
  if (!t) return null;
  if (checklist.length) await tx.insert(ticketChecklistItem).values(checklist.map((label, sortOrder) => ({ ticketId: t.id, label, sortOrder })));
  const assignees = [...memberIds.map((memberId) => ({ gardenId: values.gardenId, ticketId: t.id, memberId })), ...groupIds.map((groupId) => ({ gardenId: values.gardenId, ticketId: t.id, groupId }))];
  if (assignees.length) await tx.insert(ticketAssignee).values(assignees);
  await tx.insert(ticketEvent).values({ ticketId: t.id, actorId: values.createdBy, kind: 'created', diff: { status: values.status ?? 'todo' } });
  return t;
}

export async function loadTicket(tx: Executor, scope: Scope, ticketId: string) {
  const [t] = await tx.select().from(ticket).where(and(eq(ticket.gardenId, scope.gardenId), eq(ticket.id, ticketId), isNull(ticket.deletedAt))).limit(1);
  if (!t) throw notFound('ticketNotFound');
  return t;
}

/** Faits pour la matrice : auteur, assigné (directement ou via un groupe), sans assignation. */
export async function factsFor(tx: Executor, scope: Scope, t: typeof ticket.$inferSelect) {
  const a = await assigneesOf(tx, t.id);
  const isAssigned = a.memberIds.includes(scope.memberId) || a.groupIds.some((g) => scope.groupIds.includes(g));
  return { isOwn: t.createdBy === scope.userId, isAssigned, isUnassigned: a.memberIds.length === 0 && a.groupIds.length === 0 };
}

/** Restriction de zone : un membre hors groupe autorisé ne traite que les tickets qui lui sont assignés (§5.3). */
export async function assertZoneForTicket(tx: Executor, scope: Scope, t: typeof ticket.$inferSelect, isAssigned: boolean) {
  if (isAssigned) return;
  const zoneId = await targetZoneId(tx, scope, t);
  if (zoneId) await assertZoneContribute(tx, scope, 'ticket:create', zoneId);
}
