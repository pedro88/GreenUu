import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import { DomainError, forbidden, notFound, validation } from '@/lib/errors';
import { addDays, localDate } from '@/lib/dates';
import type { Stage } from '@/lib/enums';
import type { ScopedCtx } from '@/server/action-core';
import { can, loadScope, type Scope } from '@/server/authz/scope';
import type { Executor } from '@/server/db/client';
import { botanicalFamily, companion, culture, cultureStage, garden, harvest, journalEntry, season, species, variety, zone, zoneType } from '@/server/db/schema';
import { emit } from '@/server/events/emit';
import { assertVarietyUsable } from '../plant/service';
import { cancelCultureTickets, syncStageTickets } from '../ticket/generated';
import { seasonYearOf } from '../season/season.pure';
import { ensureSeason } from '../season/service';
import { assertZoneContribute } from '../zone/service';
import { findDescendants, findZone } from '../zone/repo';
import { areNeighbors, periodsOverlap, rotationWarning, seasonYearsTouched, type PastCulture, type RotationWarning } from './rotation.pure';
import type { CultureCreateInput, CulturePreviewInput, StageRecordInput } from './schema';
import { deriveStatus, firstDate, occupation, orderWarnings, planStages, stagesFor, type StageRow } from './stages.pure';

export const CULTURE_RESTORE_DAYS = 30;
/** Délai de retour le plus long du référentiel (solanacées, brassicacées…) : borne de la frise. */
export const MAX_RETURN_YEARS = 4;

type GardenInfo = { timezone: string; seasonStartMonth: number; tileSizeCm: number };

export async function gardenInfo(tx: Executor, gardenId: string): Promise<GardenInfo> {
  const [g] = await tx.select({ timezone: garden.timezone, seasonStartMonth: garden.seasonStartMonth, tileSizeCm: garden.tileSizeCm }).from(garden).where(eq(garden.id, gardenId)).limit(1);
  if (!g) throw notFound();
  return g;
}

async function speciesInfo(tx: Executor, speciesId: string) {
  const [s] = await tx.select({ sp: species, family: botanicalFamily }).from(species).innerJoin(botanicalFamily, eq(botanicalFamily.id, species.familyId))
    .where(eq(species.id, speciesId)).limit(1);
  if (!s) throw new DomainError('VALIDATION', 'validation', { speciesId: ['speciesNotFound'] });
  return s;
}

/** Zone visée, ancêtres et descendants : périmètre des alertes de rotation (RG-ROT-01). */
async function rotationScopeZoneIds(tx: Executor, scope: Scope, z: { id: string; path: string }) {
  const desc = await findDescendants(tx, scope, z);
  return [...(z.path ? z.path.split('/') : []), z.id, ...desc.map((d) => d.id)];
}

async function historyFor(tx: Executor, scope: Scope, zoneIds: string[], startMonth: number, excludeCultureId: string | null): Promise<PastCulture[]> {
  const rows = await tx.select({
    id: culture.id, status: culture.status, from: culture.occupiedFrom, to: culture.occupiedTo, familyId: species.familyId, perennial: species.perennial,
    greenManure: species.greenManure, names: species.commonNames, varietyName: variety.name, zoneName: zone.name,
  }).from(culture).innerJoin(species, eq(species.id, culture.speciesId)).leftJoin(variety, eq(variety.id, culture.varietyId))
    .innerJoin(zone, eq(zone.id, culture.zoneId))
    .where(and(eq(culture.gardenId, scope.gardenId), inArray(culture.zoneId, zoneIds), isNull(culture.deletedAt)));
  return rows.filter((r) => r.id !== excludeCultureId && !(r.status === 'abandoned' && !r.from)).map((r) => ({
    cultureId: r.id, familyId: r.familyId, label: [r.names.fr[0], r.varietyName].filter(Boolean).join(' '), zoneName: r.zoneName,
    years: seasonYearsTouched(r.from, r.to, startMonth), perennial: r.perennial, greenManure: r.greenManure,
  }));
}

export type CompanionWarning = { effect: 'favorable' | 'unfavorable'; speciesName: string; zoneName: string; cultureId: string };

/** RG-ROT-04 : cultures actives sur la zone ou une zone voisine pendant la période d'occupation. */
async function companionWarnings(tx: Executor, scope: Scope, z: repoZone, speciesId: string, period: { from: string | null; to: string | null }, tileCm: number, excludeCultureId: string | null) {
  const siblings = await tx.select({ id: zone.id, name: zone.name, geometry: zone.geometry }).from(zone)
    .where(and(eq(zone.gardenId, scope.gardenId), z.parentId ? eq(zone.parentId, z.parentId) : isNull(zone.parentId), isNull(zone.archivedAt)));
  const neighbors = siblings.filter((s) => s.id !== z.id && (!z.geometry || !s.geometry || areNeighbors(z.geometry, s.geometry, tileCm)));
  const zoneIds = [z.id, ...neighbors.map((n) => n.id)];
  const rels = await tx.select().from(companion).where(or(eq(companion.speciesAId, speciesId), eq(companion.speciesBId, speciesId)));
  if (rels.length === 0) return [];
  const effectOf = new Map(rels.map((r) => [r.speciesAId === speciesId ? r.speciesBId : r.speciesAId, r.effect]));
  const rows = await tx.select({ id: culture.id, speciesId: culture.speciesId, from: culture.occupiedFrom, to: culture.occupiedTo, status: culture.status, names: species.commonNames, zoneName: zone.name })
    .from(culture).innerJoin(species, eq(species.id, culture.speciesId)).innerJoin(zone, eq(zone.id, culture.zoneId))
    .where(and(eq(culture.gardenId, scope.gardenId), inArray(culture.zoneId, zoneIds), isNull(culture.deletedAt), inArray(culture.speciesId, [...effectOf.keys()])));
  return rows.filter((r) => r.id !== excludeCultureId && r.status !== 'failed' && r.status !== 'abandoned' && periodsOverlap(period, { from: r.from, to: r.to }))
    .flatMap((r): CompanionWarning[] => {
      const effect = effectOf.get(r.speciesId);
      return effect ? [{ effect, speciesName: r.names.fr[0] ?? '', zoneName: r.zoneName, cultureId: r.id }] : [];
    });
}

type repoZone = Awaited<ReturnType<typeof findZone>>;

export type CulturePreview = {
  seasonYear: number;
  stages: { stage: Stage; plannedOn: string | null }[];
  rotation: (RotationWarning & { familyCode: string; returnYears: number }) | null;
  companions: CompanionWarning[];
  zoneCanHostCultures: boolean;
};

/** Aperçu avant création : saison, dates prévues, alertes de rotation et d'associations (RG-ROT-02). */
export async function previewCulture(tx: Executor, scope: Scope, input: CulturePreviewInput, overrides: Partial<Record<Stage, string>> = {}): Promise<CulturePreview> {
  const z = await findZone(tx, scope, input.zoneId);
  const [type] = await tx.select({ canHost: zoneType.canHostCultures }).from(zoneType).where(eq(zoneType.id, z.zoneTypeId)).limit(1);
  const g = await gardenInfo(tx, scope.gardenId);
  const s = await speciesInfo(tx, input.speciesId);
  const plan = { ...planStages(input.method, s.sp.visualModel, input.anchorDate, { min: s.sp.daysToMaturityMin, max: s.sp.daysToMaturityMax }), ...overrides };
  const stages = stagesFor(input.method, s.sp.visualModel).map((stage) => ({ stage, plannedOn: plan[stage] ?? null }));
  const rows: StageRow[] = stages.map((x) => ({ ...x, actualOn: null }));
  const seasonYear = seasonYearOf(firstDate(rows) ?? input.anchorDate, g.seasonStartMonth);
  const occ = occupation(input.method, rows);
  const history = await historyFor(tx, scope, await rotationScopeZoneIds(tx, scope, z), g.seasonStartMonth, null);
  const startYear = occ.from ? seasonYearOf(occ.from, g.seasonStartMonth) : seasonYear;
  const rot = rotationWarning({ familyId: s.family.id, returnYears: s.family.rotationReturnYears, year: startYear, perennial: s.sp.perennial, greenManure: s.sp.greenManure, history });
  return {
    seasonYear,
    stages,
    rotation: rot ? { ...rot, familyCode: s.family.code, returnYears: s.family.rotationReturnYears } : null,
    companions: await companionWarnings(tx, scope, z, input.speciesId, occ, g.tileSizeCm, null),
    zoneCanHostCultures: type?.canHost ?? false,
  };
}

/** RG-CUL-01 à 03 : création d'une culture et de ses étapes prévues. */
export async function createCulture(ctx: ScopedCtx, input: CultureCreateInput) {
  const { tx, scope, actor, clock } = ctx;
  await assertZoneContribute(tx, scope, 'culture:create', input.zoneId);
  const preview = await previewCulture(tx, scope, input, input.plannedDates);
  if (!preview.zoneCanHostCultures) throw validation({ zoneId: ['zoneCannotHostCultures'] });
  if (preview.rotation && !input.acknowledgeRotation) throw new DomainError('CONFLICT', 'rotationNotAcknowledged');
  if (input.varietyId) await assertVarietyUsable(tx, input.varietyId, input.speciesId, scope.gardenId);
  if (input.seedSource === 'own_saved') await assertSeedParent(tx, scope, ctx.actor.id, input.seedParentCultureId, input.speciesId);
  const g = await gardenInfo(tx, scope.gardenId);
  const currentYear = seasonYearOf(localDate(clock.now(), g.timezone), g.seasonStartMonth);
  const s = await ensureSeason(tx, scope.gardenId, preview.seasonYear, g.seasonStartMonth, preview.seasonYear > currentYear ? 'planned' : 'active');
  if (s.status === 'closed') throw forbidden('seasonClosed');
  const rows: StageRow[] = preview.stages.map((x) => ({ ...x, actualOn: null }));
  const occ = occupation(input.method, rows);
  const [c] = await tx.insert(culture).values({
    gardenId: scope.gardenId, zoneId: input.zoneId, seasonId: s.id, speciesId: input.speciesId, varietyId: input.varietyId ?? null, method: input.method,
    status: 'planned', plantCount: input.plantCount ?? null, areaM2: input.areaM2 ?? null, seedSource: input.seedSource,
    seedParentCultureId: input.seedSource === 'own_saved' ? (input.seedParentCultureId ?? null) : null, rotationOverride: preview.rotation !== null,
    notes: input.notes ?? null, createdBy: actor.id, occupiedFrom: occ.from, occupiedTo: occ.to,
  }).returning({ id: culture.id });
  if (!c) throw new Error('Insertion de la culture échouée');
  await tx.insert(cultureStage).values(preview.stages.map((st) => ({ gardenId: scope.gardenId, cultureId: c.id, stage: st.stage, plannedOn: st.plannedOn })));
  await emit(tx, { type: 'culture.created', subjectType: 'culture', subjectId: c.id, gardenId: scope.gardenId, actorId: actor.id, payload: { speciesId: input.speciesId, method: input.method, rotationOverride: preview.rotation !== null } }, clock.now());
  await syncStageTickets(tx, scope.gardenId, c.id, actor.id, clock.now());
  return { cultureId: c.id, rotationOverride: preview.rotation !== null };
}

/** RG-CUL-08 : semences maison issues d'une culture de la même espèce ayant une récolte « semences ». */
async function assertSeedParent(tx: Executor, scope: Scope, userId: string, parentId: string | undefined, speciesId: string) {
  if (!parentId) throw validation({ seedParentCultureId: ['required'] });
  const [p] = await tx.select({ speciesId: culture.speciesId, gardenId: culture.gardenId }).from(culture).where(and(eq(culture.id, parentId), isNull(culture.deletedAt))).limit(1);
  if (!p || p.speciesId !== speciesId) throw validation({ seedParentCultureId: ['seedParentInvalid'] });
  if (p.gardenId !== scope.gardenId) {
    const other = await loadScope(tx, userId, p.gardenId);
    if (!other) throw validation({ seedParentCultureId: ['seedParentInvalid'] });
  }
  const [seedHarvest] = await tx.select({ id: harvest.id }).from(harvest).where(and(eq(harvest.cultureId, parentId), eq(harvest.seedSaving, true), isNull(harvest.deletedAt))).limit(1);
  if (!seedHarvest) throw validation({ seedParentCultureId: ['seedParentInvalid'] });
}

async function loadCulture(tx: Executor, scope: Scope, cultureId: string, opts: { includeDeleted?: boolean } = {}) {
  const [c] = await tx.select().from(culture)
    .where(and(eq(culture.gardenId, scope.gardenId), eq(culture.id, cultureId), opts.includeDeleted ? undefined : isNull(culture.deletedAt))).limit(1);
  if (!c) throw notFound('cultureNotFound');
  return c;
}

async function assertSeasonOpen(tx: Executor, seasonId: string) {
  const [s] = await tx.select({ status: season.status }).from(season).where(eq(season.id, seasonId)).limit(1);
  if (s?.status === 'closed') throw forbidden('seasonClosed');
}

/** Recalcule statut et occupation à partir des étapes (après toute modification). */
async function recompute(tx: Executor, c: typeof culture.$inferSelect) {
  const rows = await tx.select({ stage: cultureStage.stage, plannedOn: cultureStage.plannedOn, actualOn: cultureStage.actualOn }).from(cultureStage).where(eq(cultureStage.cultureId, c.id));
  const occ = occupation(c.method, rows);
  const status = deriveStatus(rows, c.status);
  await tx.update(culture).set({ occupiedFrom: occ.from, occupiedTo: occ.to, status }).where(eq(culture.id, c.id));
  return { rows, status };
}

/**
 * Saisie d'une date prévue ou réelle d'étape (CUL-02 à 04, SEA-02). Une date réelle au-delà de demain est refusée ;
 * une incohérence d'ordre est renvoyée en avertissement. `targetZoneId` déplace la culture (repiquage / plantation).
 */
export async function recordStage(ctx: ScopedCtx, input: StageRecordInput) {
  const { tx, scope, actor, clock } = ctx;
  const c = await loadCulture(tx, scope, input.cultureId);
  await assertZoneContribute(tx, scope, 'culture:update', c.zoneId);
  await assertSeasonOpen(tx, c.seasonId);
  const g = await gardenInfo(tx, scope.gardenId);
  const tomorrow = localDate(addDays(clock.now(), 1), g.timezone);
  if (input.actualOn && input.actualOn > tomorrow) throw validation({ actualOn: ['futureDate'] });
  const [existing] = await tx.select().from(cultureStage).where(and(eq(cultureStage.cultureId, c.id), eq(cultureStage.stage, input.stage))).limit(1);
  const values = {
    ...(input.plannedOn !== undefined ? { plannedOn: input.plannedOn } : {}),
    ...(input.actualOn !== undefined ? { actualOn: input.actualOn, recordedBy: actor.id } : {}),
  };
  if (existing) await tx.update(cultureStage).set(values).where(eq(cultureStage.id, existing.id));
  else await tx.insert(cultureStage).values({ gardenId: scope.gardenId, cultureId: c.id, stage: input.stage, ...values });
  if (input.targetZoneId && input.targetZoneId !== c.zoneId && (input.stage === 'transplanting' || input.stage === 'planting')) {
    await moveCulture(ctx, c, input.targetZoneId, input.actualOn ?? input.plannedOn ?? localDate(clock.now(), g.timezone));
  }
  const fresh = await loadCulture(tx, scope, c.id);
  const { rows, status } = await recompute(tx, fresh);
  await syncStageTickets(tx, scope.gardenId, c.id, actor.id, clock.now());
  if (input.actualOn !== undefined || input.plannedOn !== undefined) {
    await emit(tx, { type: 'culture.stage_recorded', subjectType: 'culture', subjectId: c.id, gardenId: scope.gardenId, actorId: actor.id, payload: { stage: input.stage, actualOn: input.actualOn ?? null, plannedOn: input.plannedOn ?? null } }, clock.now());
  }
  if (status === 'finished' && c.status !== 'finished') {
    await emit(tx, { type: 'culture.ended', subjectType: 'culture', subjectId: c.id, gardenId: scope.gardenId, actorId: actor.id, payload: { status } }, clock.now());
  }
  return { cultureId: c.id, status, warnings: orderWarnings(rows) };
}

/** CUL-08 : changement de zone tracé dans le journal (entrée `intervention = transplant`). */
async function moveCulture(ctx: ScopedCtx, c: typeof culture.$inferSelect, targetZoneId: string, on: string) {
  const { tx, scope, actor, clock } = ctx;
  const target = await assertZoneContribute(tx, scope, 'culture:update', targetZoneId);
  const [type] = await tx.select({ canHost: zoneType.canHostCultures }).from(zoneType).where(eq(zoneType.id, target.zoneTypeId)).limit(1);
  if (!type?.canHost || target.archivedAt) throw validation({ targetZoneId: ['zoneCannotHostCultures'] });
  const [from] = await tx.select({ name: zone.name }).from(zone).where(eq(zone.id, c.zoneId)).limit(1);
  await tx.update(culture).set({ zoneId: target.id }).where(eq(culture.id, c.id));
  // Les titres des tickets d'étape citent la zone : ils seront resynchronisés après le recalcul.
  await tx.insert(journalEntry).values({
    gardenId: scope.gardenId, cultureId: c.id, kind: 'intervention', intervention: 'transplant', observedAt: new Date(`${on}T12:00:00Z`),
    body: `${from?.name ?? ''} → ${target.name}`, authorId: actor.id,
  });
  await emit(tx, { type: 'culture.moved', subjectType: 'culture', subjectId: c.id, gardenId: scope.gardenId, actorId: actor.id, payload: { fromZoneId: c.zoneId, toZoneId: target.id } }, clock.now());
}

export async function updateCulture(ctx: ScopedCtx, input: { cultureId: string; varietyId: string | null; plantCount?: number | undefined; areaM2?: number | undefined; notes?: string | undefined }) {
  const { tx, scope, actor, clock } = ctx;
  const c = await loadCulture(tx, scope, input.cultureId);
  await assertZoneContribute(tx, scope, 'culture:update', c.zoneId);
  await assertSeasonOpen(tx, c.seasonId);
  if (input.varietyId) await assertVarietyUsable(tx, input.varietyId, c.speciesId, scope.gardenId);
  await tx.update(culture).set({ varietyId: input.varietyId, plantCount: input.plantCount ?? null, areaM2: input.areaM2 ?? null, notes: input.notes ?? null }).where(eq(culture.id, c.id));
  await emit(tx, { type: 'culture.updated', subjectType: 'culture', subjectId: c.id, gardenId: scope.gardenId, actorId: actor.id, payload: { fields: ['varietyId', 'plantCount', 'areaM2', 'notes'] } }, clock.now());
  return { cultureId: c.id };
}

/** RG-CUL-04 : fin en échec ou abandon, déclarés explicitement. */
export async function setOutcome(ctx: ScopedCtx, input: { cultureId: string; outcome: 'failed' | 'abandoned'; on?: string | undefined }) {
  const { tx, scope, actor, clock } = ctx;
  const c = await loadCulture(tx, scope, input.cultureId);
  await assertZoneContribute(tx, scope, 'culture:update', c.zoneId);
  await assertSeasonOpen(tx, c.seasonId);
  const g = await gardenInfo(tx, scope.gardenId);
  const on = input.on ?? localDate(clock.now(), g.timezone);
  await tx.insert(cultureStage).values({ gardenId: scope.gardenId, cultureId: c.id, stage: 'end', actualOn: on, recordedBy: actor.id })
    .onConflictDoUpdate({ target: [cultureStage.cultureId, cultureStage.stage], set: { actualOn: on, recordedBy: actor.id } });
  await tx.update(culture).set({ status: input.outcome }).where(eq(culture.id, c.id));
  await recompute(tx, { ...c, status: input.outcome });
  await syncStageTickets(tx, scope.gardenId, c.id, actor.id, clock.now());
  await emit(tx, { type: 'culture.ended', subjectType: 'culture', subjectId: c.id, gardenId: scope.gardenId, actorId: actor.id, payload: { status: input.outcome } }, clock.now());
  return { cultureId: c.id };
}

/** RG-CUL-07 : suppression logique (auteur ou admin) ; journal et récoltes masqués avec elle. */
export async function deleteCulture(ctx: ScopedCtx, cultureId: string) {
  const { tx, scope, actor, clock } = ctx;
  const c = await loadCulture(tx, scope, cultureId);
  await assertZoneContribute(tx, scope, 'culture:delete', c.zoneId, { isOwn: c.createdBy === actor.id });
  await tx.update(culture).set({ deletedAt: clock.now(), deletedBy: actor.id }).where(eq(culture.id, c.id));
  // RG-CUL-07 : ses tickets ouverts sont annulés.
  await cancelCultureTickets(tx, scope.gardenId, c.id, actor.id);
  await emit(tx, { type: 'culture.deleted', subjectType: 'culture', subjectId: c.id, gardenId: scope.gardenId, actorId: actor.id, payload: {} }, clock.now());
  return { cultureId: c.id };
}

export async function restoreCulture(ctx: ScopedCtx, cultureId: string) {
  const { tx, scope, actor, clock } = ctx;
  const c = await loadCulture(tx, scope, cultureId, { includeDeleted: true });
  if (!c.deletedAt) return { cultureId: c.id };
  if (!(can(scope, 'culture:delete', { isOwn: c.createdBy === actor.id }))) throw forbidden();
  if (clock.now().getTime() - c.deletedAt.getTime() > CULTURE_RESTORE_DAYS * 86_400_000) throw forbidden('restoreExpired');
  await tx.update(culture).set({ deletedAt: null, deletedBy: null }).where(eq(culture.id, c.id));
  await emit(tx, { type: 'culture.restored', subjectType: 'culture', subjectId: c.id, gardenId: scope.gardenId, actorId: actor.id, payload: {} }, clock.now());
  return { cultureId: c.id };
}
