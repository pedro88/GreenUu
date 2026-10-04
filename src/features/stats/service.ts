import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { notFound } from '@/lib/errors';
import type { Scope } from '@/server/authz/scope';
import type { Executor } from '@/server/db/client';
import { culture, garden, harvest, season, species, zone } from '@/server/db/schema';
import { statsCsv, successRates, yields, type CultureOutcome, type HarvestRow } from './stats.pure';

/* Statistiques pluriannuelles d'un jardin (SPEC §12.10, STAT, PAGES.md §4 `/statistiques`). Lecture seule. */

const MAX_ROWS = 50_000;
const speciesName = sql<string>`${species.commonNames}->'fr'->>0`;
/** Surface de la zone en m² : dimensions saisies, sinon géométrie du plan ; null si inconnue. */
const areaM2 = sql<number | null>`coalesce(${zone.lengthCm} * ${zone.widthCm}, (${zone.geometry}->>'w')::numeric * (${zone.geometry}->>'h')::numeric) / 10000.0`;

async function harvestRows(tx: Executor, scope: Scope): Promise<HarvestRow[]> {
  const rows = await tx.select({
    speciesId: species.id, speciesName, zoneId: zone.id, zoneName: zone.name, areaM2, harvestedOn: harvest.harvestedOn, quantity: harvest.quantity, unit: harvest.unit, quantityKg: harvest.quantityKg,
  }).from(harvest).innerJoin(culture, eq(culture.id, harvest.cultureId)).innerJoin(species, eq(species.id, culture.speciesId)).innerJoin(zone, eq(zone.id, culture.zoneId))
    .where(and(eq(harvest.gardenId, scope.gardenId), isNull(harvest.deletedAt), isNull(culture.deletedAt))).limit(MAX_ROWS);
  return rows.map((r) => ({ ...r, areaM2: r.areaM2 === null ? null : Number(r.areaM2) }));
}

async function startMonthOf(tx: Executor, scope: Scope) {
  const [g] = await tx.select({ m: garden.seasonStartMonth }).from(garden).where(eq(garden.id, scope.gardenId)).limit(1);
  if (!g) throw notFound();
  return g.m;
}

export async function gardenStats(tx: Executor, scope: Scope) {
  const startMonth = await startMonthOf(tx, scope);
  const outcomes: CultureOutcome[] = await tx.select({ speciesId: species.id, speciesName, seasonYear: season.year, status: culture.status })
    .from(culture).innerJoin(species, eq(species.id, culture.speciesId)).innerJoin(season, eq(season.id, culture.seasonId))
    .where(and(eq(culture.gardenId, scope.gardenId), isNull(culture.deletedAt), isNotNull(culture.seasonId))).limit(MAX_ROWS);
  return { startMonth, ...yields(await harvestRows(tx, scope), startMonth), success: successRates(outcomes) };
}

/** STAT-07 : export CSV, réservé à `garden:export` par l'action. */
export async function gardenStatsCsv(tx: Executor, scope: Scope) {
  const [g] = await tx.select({ name: garden.name }).from(garden).where(eq(garden.id, scope.gardenId)).limit(1);
  const csv = statsCsv(await harvestRows(tx, scope), await startMonthOf(tx, scope));
  const slug = (g?.name ?? 'jardin').normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase().replace(/^-|-$/g, '');
  return { filename: `statistiques-${slug}.csv`, csv };
}
