import { and, asc, count, eq, inArray, isNull } from 'drizzle-orm';
import { DomainError, notFound, validation } from '@/lib/errors';
import { encodeGeohash } from '@/lib/geohash';
import { localDate, addDays } from '@/lib/dates';
import type { ScopedCtx, ServiceCtx } from '@/server/action-core';
import { assertCan, can, type Scope } from '@/server/authz/scope';
import { defaultPlanEditMinRole } from '@/server/authz/permissions';
import type { Executor } from '@/server/db/client';
import { garden, gardenEnvironment, gardenMember, user } from '@/server/db/schema';
import { emit } from '@/server/events/emit';
import { gardenDeletedMail } from '@/server/mail/templates';
import { ensureSeason } from '../season/service';
import { defaultSeasonStartMonth, seasonYearOf } from '../season/season.pure';
import type { GardenCreateInput, GardenUpdateInput } from './schema';

export const GARDEN_PURGE_DELAY_DAYS = 30;

/** RG-GRD-01 : création d'un jardin ; le créateur devient owner, la saison courante est créée. */
export async function createGarden(ctx: ServiceCtx, input: GardenCreateInput) {
  const { tx, actor, clock } = ctx;
  const seasonStartMonth = defaultSeasonStartMonth(input.lat);
  const [g] = await tx
    .insert(garden)
    .values({
      name: input.name,
      orgType: input.orgType,
      lat: input.lat,
      lng: input.lng,
      geohash4: encodeGeohash(input.lat, input.lng, 4),
      placeLabel: input.placeLabel ?? null,
      altitudeM: input.altitudeM ?? null,
      koppen: input.koppen ?? null,
      hardinessZone: input.hardinessZone ?? null,
      soilType: input.soilType,
      soilPh: input.soilPh ?? null,
      exposure: input.exposure ?? null,
      waterAccess: input.waterAccess ?? null,
      timezone: input.timezone,
      seasonStartMonth,
      planEditMinRole: defaultPlanEditMinRole(input.orgType),
      createdBy: actor.id,
    })
    .returning({ id: garden.id });
  if (!g) throw new Error('Insertion du jardin échouée');
  await tx.insert(gardenEnvironment).values(input.environments.map((environment, position) => ({ gardenId: g.id, environment, position })));
  const [m] = await tx.insert(gardenMember).values({ gardenId: g.id, userId: actor.id, role: 'owner' }).returning({ id: gardenMember.id });
  if (!m) throw new Error('Insertion du membre échouée');
  const year = seasonYearOf(localDate(clock.now(), input.timezone), seasonStartMonth);
  await ensureSeason(tx, g.id, year, seasonStartMonth, 'active');
  await emit(tx, { type: 'garden.created', subjectType: 'garden', subjectId: g.id, gardenId: g.id, actorId: actor.id, payload: { orgType: input.orgType } }, clock.now());
  await emit(tx, { type: 'member.joined', subjectType: 'member', subjectId: m.id, gardenId: g.id, actorId: actor.id, payload: { userId: actor.id, role: 'owner', via: 'creation' } }, clock.now());
  return { gardenId: g.id };
}

/** Lecture d'un jardin. La localisation précise n'est renvoyée qu'avec `garden:read_location` (RG-GRD-02). */
export async function getGarden(tx: Executor, scope: Scope) {
  const [g] = await tx.select().from(garden).where(and(eq(garden.id, scope.gardenId), isNull(garden.deletedAt))).limit(1);
  if (!g) throw notFound();
  const envs = await tx.select({ environment: gardenEnvironment.environment }).from(gardenEnvironment)
    .where(eq(gardenEnvironment.gardenId, g.id)).orderBy(asc(gardenEnvironment.position));
  const { lat, lng, ...rest } = g;
  const location = can(scope, 'garden:read_location') ? { lat, lng } : null;
  return { ...rest, location, environments: envs.map((e) => e.environment) };
}

export type GardenView = Awaited<ReturnType<typeof getGarden>>;

export async function updateGarden(ctx: ScopedCtx, input: GardenUpdateInput) {
  const { tx, scope, actor, clock } = ctx;
  assertCan(scope, 'garden:update');
  await tx.update(garden).set({
    name: input.name,
    orgType: input.orgType,
    lat: input.lat,
    lng: input.lng,
    geohash4: encodeGeohash(input.lat, input.lng, 4),
    placeLabel: input.placeLabel ?? null,
    altitudeM: input.altitudeM ?? null,
    koppen: input.koppen ?? null,
    hardinessZone: input.hardinessZone ?? null,
    soilType: input.soilType,
    soilPh: input.soilPh ?? null,
    exposure: input.exposure ?? null,
    waterAccess: input.waterAccess ?? null,
    timezone: input.timezone,
    seasonStartMonth: input.seasonStartMonth,
    planEditMinRole: input.planEditMinRole,
  }).where(eq(garden.id, scope.gardenId));
  await tx.delete(gardenEnvironment).where(eq(gardenEnvironment.gardenId, scope.gardenId));
  await tx.insert(gardenEnvironment).values(input.environments.map((environment, position) => ({ gardenId: scope.gardenId, environment, position })));
  await emit(tx, { type: 'garden.updated', subjectType: 'garden', subjectId: scope.gardenId, gardenId: scope.gardenId, actorId: actor.id, payload: { fields: Object.keys(input) } }, clock.now());
  return { gardenId: scope.gardenId };
}

/** RG-GRD-04 : archivage (lecture seule) ou désarchivage, owner uniquement. */
export async function setArchived(ctx: ScopedCtx, archived: boolean) {
  const { tx, scope, actor, clock } = ctx;
  assertCan(scope, 'garden:archive');
  await tx.update(garden).set({ archivedAt: archived ? clock.now() : null }).where(eq(garden.id, scope.gardenId));
  await emit(tx, { type: archived ? 'garden.archived' : 'garden.unarchived', subjectType: 'garden', subjectId: scope.gardenId, gardenId: scope.gardenId, actorId: actor.id, payload: {} }, clock.now());
  return { gardenId: scope.gardenId };
}

/** RG-GRD-05 : suppression logique, purge à J+30, membres prévenus par e-mail. */
export async function deleteGarden(ctx: ScopedCtx, confirmName: string) {
  const { tx, scope, actor, clock, jobs } = ctx;
  assertCan(scope, 'garden:delete');
  const [g] = await tx.select({ name: garden.name }).from(garden).where(eq(garden.id, scope.gardenId)).limit(1);
  if (!g) throw notFound();
  if (confirmName.trim() !== g.name) throw validation({ confirmName: ['confirmNameMismatch'] });
  const now = clock.now();
  await tx.update(garden).set({ deletedAt: now, purgeAfter: addDays(now, GARDEN_PURGE_DELAY_DAYS) }).where(eq(garden.id, scope.gardenId));
  const members = await tx.select({ email: user.email }).from(gardenMember).innerJoin(user, eq(user.id, gardenMember.userId))
    .where(and(eq(gardenMember.gardenId, scope.gardenId), isNull(gardenMember.leftAt)));
  for (const m of members) await jobs.enqueue('mail.send', gardenDeletedMail({ to: m.email, gardenName: g.name }));
  await emit(tx, { type: 'garden.deleted', subjectType: 'garden', subjectId: scope.gardenId, gardenId: scope.gardenId, actorId: actor.id, payload: {} }, now);
  return { gardenId: scope.gardenId };
}

/** RG-MBR-03 : transfert de propriété à un admin actif ; l'ancien owner devient admin. */
export async function transferOwnership(ctx: ScopedCtx, toMemberId: string) {
  const { tx, scope, actor, clock } = ctx;
  assertCan(scope, 'garden:transfer');
  const [target] = await tx.select().from(gardenMember)
    .where(and(eq(gardenMember.id, toMemberId), eq(gardenMember.gardenId, scope.gardenId), isNull(gardenMember.leftAt))).limit(1);
  if (!target) throw notFound();
  if (target.role !== 'admin') throw new DomainError('VALIDATION', 'transferTargetMustBeAdmin');
  // L'index unique « un seul owner actif » impose de rétrograder avant de promouvoir.
  await tx.update(gardenMember).set({ role: 'admin' }).where(eq(gardenMember.id, scope.memberId));
  await tx.update(gardenMember).set({ role: 'owner' }).where(eq(gardenMember.id, target.id));
  await emit(tx, { type: 'garden.ownership_transferred', subjectType: 'garden', subjectId: scope.gardenId, gardenId: scope.gardenId, actorId: actor.id, payload: { fromUserId: actor.id, toUserId: target.userId } }, clock.now());
  return { gardenId: scope.gardenId };
}

/** Jardins dont l'utilisateur est membre actif, avec son rôle (MBR-06). */
export async function listMyGardens(tx: Executor, userId: string) {
  const rows = await tx
    .select({ id: garden.id, name: garden.name, orgType: garden.orgType, placeLabel: garden.placeLabel, archivedAt: garden.archivedAt, role: gardenMember.role })
    .from(gardenMember)
    .innerJoin(garden, eq(garden.id, gardenMember.gardenId))
    .where(and(eq(gardenMember.userId, userId), isNull(gardenMember.leftAt), isNull(garden.deletedAt)))
    .orderBy(asc(garden.name));
  if (rows.length === 0) return [];
  const counts = await tx.select({ gardenId: gardenMember.gardenId, n: count() }).from(gardenMember)
    .where(and(inArray(gardenMember.gardenId, rows.map((r) => r.id)), isNull(gardenMember.leftAt)))
    .groupBy(gardenMember.gardenId);
  const byGarden = new Map(counts.map((c) => [c.gardenId, c.n]));
  return rows.map((r) => ({ ...r, memberCount: byGarden.get(r.id) ?? 1 }));
}

