import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { notFound, validation } from '@/lib/errors';
import type { ScopedCtx } from '@/server/action-core';
import { assertCan, type Scope } from '@/server/authz/scope';
import type { Executor } from '@/server/db/client';
import { gardenGroup, gardenMember, groupMember, zoneGroupPermission } from '@/server/db/schema';
import { emit } from '@/server/events/emit';
import { notify } from '../notification/service';
import { unassignGroup } from '../ticket/generated';

type GroupInput = { name: string; color: string; memberIds: string[] };

/** RG-GRP-01 : seuls des membres actifs du jardin ; nom unique parmi les groupes actifs. */
async function assertActiveMembers(tx: Executor, scope: Scope, memberIds: string[]) {
  const unique = [...new Set(memberIds)];
  if (unique.length === 0) return unique;
  const rows = await tx.select({ id: gardenMember.id }).from(gardenMember)
    .where(and(eq(gardenMember.gardenId, scope.gardenId), inArray(gardenMember.id, unique), isNull(gardenMember.leftAt)));
  if (rows.length !== unique.length) throw validation({ memberIds: ['notActiveMember'] });
  return unique;
}

async function assertUniqueName(tx: Executor, scope: Scope, name: string, exceptId: string | null) {
  const rows = await tx.select({ id: gardenGroup.id, name: gardenGroup.name }).from(gardenGroup)
    .where(and(eq(gardenGroup.gardenId, scope.gardenId), isNull(gardenGroup.archivedAt)));
  if (rows.some((r) => r.id !== exceptId && r.name.toLowerCase() === name.toLowerCase())) throw validation({ name: ['groupNameTaken'] });
}

export async function createGroup(ctx: ScopedCtx, input: GroupInput) {
  const { tx, scope, actor, clock } = ctx;
  assertCan(scope, 'group:manage');
  await assertUniqueName(tx, scope, input.name, null);
  const memberIds = await assertActiveMembers(tx, scope, input.memberIds);
  const [g] = await tx.insert(gardenGroup).values({ gardenId: scope.gardenId, name: input.name, color: input.color }).returning({ id: gardenGroup.id });
  if (!g) throw new Error('Insertion du groupe échouée');
  if (memberIds.length > 0) await tx.insert(groupMember).values(memberIds.map((memberId) => ({ gardenId: scope.gardenId, groupId: g.id, memberId })));
  await emit(tx, { type: 'group.created', subjectType: 'group', subjectId: g.id, gardenId: scope.gardenId, actorId: actor.id, payload: {} }, clock.now());
  return { groupId: g.id };
}

export async function updateGroup(ctx: ScopedCtx, groupId: string, input: GroupInput) {
  const { tx, scope } = ctx;
  assertCan(scope, 'group:manage');
  const group = await findActiveGroup(tx, scope, groupId);
  await assertUniqueName(tx, scope, input.name, group.id);
  const memberIds = await assertActiveMembers(tx, scope, input.memberIds);
  await tx.update(gardenGroup).set({ name: input.name, color: input.color }).where(eq(gardenGroup.id, group.id));
  await tx.delete(groupMember).where(eq(groupMember.groupId, group.id));
  if (memberIds.length > 0) await tx.insert(groupMember).values(memberIds.map((memberId) => ({ gardenId: scope.gardenId, groupId: group.id, memberId })));
  return { groupId };
}

/** RG-GRP-02 : archiver retire les restrictions de zone et les assignations du groupe ; les créateurs sont prévenus. */
export async function archiveGroup(ctx: ScopedCtx, groupId: string) {
  const { tx, scope, actor, clock } = ctx;
  assertCan(scope, 'group:manage');
  const group = await findActiveGroup(tx, scope, groupId);
  await tx.update(gardenGroup).set({ archivedAt: clock.now() }).where(eq(gardenGroup.id, group.id));
  await tx.delete(zoneGroupPermission).where(and(eq(zoneGroupPermission.gardenId, scope.gardenId), eq(zoneGroupPermission.groupId, group.id)));
  const orphaned = await unassignGroup(tx, scope.gardenId, group.id);
  for (const t of orphaned) {
    await notify(tx, ctx.jobs, ctx.appUrl, {
      userIds: [t.createdBy], type: 'group_archived_unassigned', gardenId: scope.gardenId, groupKey: t.id, actorId: actor.id, now: clock.now(),
      payload: { title: t.title, url: `/app/jardins/${scope.gardenId}/tickets/${t.id}`, excerpt: group.name },
    });
  }
  await emit(tx, { type: 'group.archived', subjectType: 'group', subjectId: group.id, gardenId: scope.gardenId, actorId: actor.id, payload: {} }, clock.now());
  return { groupId };
}

async function findActiveGroup(tx: Executor, scope: Scope, groupId: string) {
  const [g] = await tx.select().from(gardenGroup)
    .where(and(eq(gardenGroup.id, groupId), eq(gardenGroup.gardenId, scope.gardenId), isNull(gardenGroup.archivedAt))).limit(1);
  if (!g) throw notFound('groupNotFound');
  return g;
}

export async function listGroups(tx: Executor, scope: Scope) {
  const groups = await tx.select().from(gardenGroup)
    .where(and(eq(gardenGroup.gardenId, scope.gardenId), isNull(gardenGroup.archivedAt))).orderBy(asc(gardenGroup.name));
  const members = await tx.select({ groupId: groupMember.groupId, memberId: groupMember.memberId }).from(groupMember)
    .where(eq(groupMember.gardenId, scope.gardenId));
  return groups.map((g) => ({ ...g, memberIds: members.filter((m) => m.groupId === g.id).map((m) => m.memberId) }));
}
