import { and, asc, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { localDate } from '@/lib/dates';
import { notFound } from '@/lib/errors';
import type { Scope } from '@/server/authz/scope';
import type { Executor } from '@/server/db/client';
import { botanicalFamily, culture, cultureStage, garden, planSnapshot, species, userProfile, variety } from '@/server/db/schema';
import { familyKey } from '@/game/manifest';
import { planState } from './history';
import { planSnapshotV1Schema } from './history.schema';
import type { HistoryData } from './timelapse.pure';
import { MAX_YEARS, thinSnapshots } from './timelapse.pure';

/*
 * Données de l'histoire du jardin (SPEC §12.11, TLP) : instantanés du plan des 3 dernières années (et le dernier pris
 * avant), plan actuel pour la période sans instantané, cultures de la période avec leurs étapes. Lecture seule, mêmes
 * droits que la vue jardin (le `scope` vient de `requireGardenScope`, TLP-05).
 */

/** Instantanés lus au plus (un par jour de modification). */
const MAX_SNAPSHOTS = 400;
const MAX_CULTURES = 2000;

export async function gardenHistory(tx: Executor, scope: Scope, now: Date): Promise<HistoryData> {
  const [g] = await tx.select({ name: garden.name, lat: garden.lat, timezone: garden.timezone }).from(garden).where(eq(garden.id, scope.gardenId)).limit(1);
  if (!g) throw notFound();
  const today = localDate(now, g.timezone);
  const from = `${Number(today.slice(0, 4)) - MAX_YEARS}${today.slice(4)}`;
  const current = await planState(tx, scope.gardenId);
  if (!current) throw notFound();

  const [before] = await tx.select({ takenOn: planSnapshot.takenOn }).from(planSnapshot)
    .where(and(eq(planSnapshot.gardenId, scope.gardenId), sql`${planSnapshot.takenOn} < ${from}`)).orderBy(sql`${planSnapshot.takenOn} desc`).limit(1);
  const rows = await tx.select({ takenOn: planSnapshot.takenOn, payload: planSnapshot.payload }).from(planSnapshot)
    .where(and(eq(planSnapshot.gardenId, scope.gardenId), gte(planSnapshot.takenOn, before?.takenOn ?? from), lte(planSnapshot.takenOn, today)))
    .orderBy(asc(planSnapshot.takenOn)).limit(MAX_SNAPSHOTS);
  // Scène extérieure, un instantané par semaine, sous un plafond de poids (audit lot 10, M1).
  const snapshots = thinSnapshots(rows.flatMap((r) => {
    const p = planSnapshotV1Schema.safeParse(r.payload);
    return p.success ? [{ takenOn: r.takenOn, payload: p.data }] : [];
  }));

  const list = await tx.select({
    id: culture.id, zoneId: culture.zoneId, method: culture.method, perennial: species.perennial, visualModel: species.visualModel,
    speciesKey: species.spriteKey, varietyKey: variety.spriteKey, family: botanicalFamily.code,
    label: sql<string>`concat_ws(' ', ${species.commonNames}->'fr'->>0, ${variety.name})`,
    plantCount: culture.plantCount, areaM2: culture.areaM2, density: culture.density, densityUnit: culture.densityUnit,
    spacingPlantCm: sql<number | null>`coalesce(${culture.spacingPlantCm}, ${species.spacingPlantCm})`, spacingRowCm: sql<number | null>`coalesce(${culture.spacingRowCm}, ${species.spacingRowCm})`,
  }).from(culture).innerJoin(species, eq(species.id, culture.speciesId)).innerJoin(botanicalFamily, eq(botanicalFamily.id, species.familyId))
    .leftJoin(variety, eq(variety.id, culture.varietyId))
    .where(and(eq(culture.gardenId, scope.gardenId), isNull(culture.deletedAt), or(isNull(culture.occupiedTo), gte(culture.occupiedTo, from))))
    .limit(MAX_CULTURES);
  const stages = list.length ? await tx.select({ cultureId: cultureStage.cultureId, stage: cultureStage.stage, plannedOn: cultureStage.plannedOn, actualOn: cultureStage.actualOn })
    .from(cultureStage).where(inArray(cultureStage.cultureId, list.map((c) => c.id))) : [];
  const [prof] = await tx.select({ reducedMotion: userProfile.reducedMotion }).from(userProfile).where(eq(userProfile.userId, scope.userId)).limit(1);
  return {
    gardenId: scope.gardenId, gardenName: g.name, south: g.lat < 0, today, snapshots, current, reducedMotion: prof?.reducedMotion ?? false,
    cultures: list.map((c) => ({
      id: c.id, zoneId: c.zoneId, label: c.label, method: c.method, perennial: c.perennial, visualModel: c.visualModel,
      spriteKeys: [c.varietyKey, c.speciesKey, familyKey(c.family)].filter((k): k is string => !!k),
      stages: stages.filter((s) => s.cultureId === c.id).map(({ stage, plannedOn, actualOn }) => ({ stage, plannedOn, actualOn })),
      facts: { plantCount: c.plantCount, areaM2: c.areaM2, spacingPlantCm: c.spacingPlantCm, spacingRowCm: c.spacingRowCm, density: c.density, densityUnit: c.densityUnit },
    })),
  };
}
