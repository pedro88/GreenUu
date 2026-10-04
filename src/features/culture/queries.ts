/** Lectures des cultures : liste, fiche, historique d'une zone, frise des saisons. */
import { and, asc, desc, eq, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { notFound } from '@/lib/errors';
import { type Scope } from '@/server/authz/scope';
import type { Executor } from '@/server/db/client';
import { attachment, botanicalFamily, culture, cultureStage, harvest, journalEntry, season, species, variety, zone, zoneType } from '@/server/db/schema';
import { findDescendants, findZone } from '../zone/repo';
import { effectiveSurface } from '../zone/tree';
import { periodsOverlap, seasonYearsTouched } from './rotation.pure';
import type { CultureFilters } from './schema';
import { cultureArea, plantsPerM2, orderWarnings, stageOrder } from './stages.pure';
import { gardenInfo, MAX_RETURN_YEARS } from './service';

const cultureLabel = sql<string>`concat_ws(' ', ${species.commonNames}->'fr'->>0, ${variety.name})`;

export const CULTURE_PAGE_SIZE = 50;
export const JOURNAL_LIMIT = 100;

/** Liste filtrable (saison, zone avec sous-zones, espèce, statut), bornée (audit M5). */
export async function listCultures(tx: Executor, scope: Scope, f: CultureFilters, page: { limit?: number; offset?: number } = {}) {
  let zoneIds: string[] | null = null;
  if (f.zone) {
    const z = await findZone(tx, scope, f.zone);
    zoneIds = [z.id, ...(await findDescendants(tx, scope, z)).map((d) => d.id)];
  }
  return tx.select({
    id: culture.id, label: cultureLabel, status: culture.status, method: culture.method, zoneId: culture.zoneId, zoneName: zone.name,
    seasonYear: season.year, occupiedFrom: culture.occupiedFrom, occupiedTo: culture.occupiedTo, spriteKey: species.spriteKey,
    familyCode: botanicalFamily.code, speciesId: culture.speciesId,
  }).from(culture).innerJoin(species, eq(species.id, culture.speciesId)).innerJoin(botanicalFamily, eq(botanicalFamily.id, species.familyId))
    .leftJoin(variety, eq(variety.id, culture.varietyId)).innerJoin(zone, eq(zone.id, culture.zoneId)).innerJoin(season, eq(season.id, culture.seasonId))
    .where(and(
      eq(culture.gardenId, scope.gardenId), isNull(culture.deletedAt),
      f.season ? eq(season.year, f.season) : undefined, zoneIds ? inArray(culture.zoneId, zoneIds) : undefined,
      f.species ? eq(culture.speciesId, f.species) : undefined, f.status ? eq(culture.status, f.status) : undefined,
    ))
    .orderBy(desc(season.year), asc(culture.occupiedFrom), asc(zone.name), asc(culture.id))
    .limit(Math.min(page.limit ?? CULTURE_PAGE_SIZE, 500))
    .offset(page.offset ?? 0);
}

/** Nombre de cultures correspondant aux filtres (pour « voir plus »). */
export async function countCultures(tx: Executor, scope: Scope, f: CultureFilters) {
  let zoneIds: string[] | null = null;
  if (f.zone) {
    const z = await findZone(tx, scope, f.zone);
    zoneIds = [z.id, ...(await findDescendants(tx, scope, z)).map((d) => d.id)];
  }
  const [r] = await tx.select({ n: sql<number>`count(*)::int` }).from(culture).innerJoin(season, eq(season.id, culture.seasonId))
    .where(and(
      eq(culture.gardenId, scope.gardenId), isNull(culture.deletedAt),
      f.season ? eq(season.year, f.season) : undefined, zoneIds ? inArray(culture.zoneId, zoneIds) : undefined,
      f.species ? eq(culture.speciesId, f.species) : undefined, f.status ? eq(culture.status, f.status) : undefined,
    ));
  return r?.n ?? 0;
}

/** Espèces cultivées dans le jardin (options du filtre), sans charger toutes les cultures. */
export async function cultureSpeciesOptions(tx: Executor, scope: Scope) {
  return tx.selectDistinct({ id: species.id, label: sql<string>`${species.commonNames}->'fr'->>0` }).from(culture)
    .innerJoin(species, eq(species.id, culture.speciesId))
    .where(and(eq(culture.gardenId, scope.gardenId), isNull(culture.deletedAt)))
    .orderBy(sql`${species.commonNames}->'fr'->>0`)
    .limit(200);
}

export type CultureListRow = Awaited<ReturnType<typeof listCultures>>[number];

/** Fiche culture : étapes, journal (avec photos), récoltes, surface et totaux. */
export async function cultureDetail(tx: Executor, scope: Scope, cultureId: string) {
  const [row] = await tx.select({ c: culture, sp: species, family: botanicalFamily, varietyName: variety.name, varietyStatus: variety.status, zoneName: zone.name, zonePath: zone.path, seasonYear: season.year, seasonStatus: season.status })
    .from(culture).innerJoin(species, eq(species.id, culture.speciesId)).innerJoin(botanicalFamily, eq(botanicalFamily.id, species.familyId))
    .leftJoin(variety, eq(variety.id, culture.varietyId)).innerJoin(zone, eq(zone.id, culture.zoneId)).innerJoin(season, eq(season.id, culture.seasonId))
    .where(and(eq(culture.gardenId, scope.gardenId), eq(culture.id, cultureId))).limit(1);
  if (!row) throw notFound('cultureNotFound');
  const stages = (await tx.select().from(cultureStage).where(eq(cultureStage.cultureId, cultureId))).sort((a, b) => stageOrder(a.stage) - stageOrder(b.stage));
  const entries = await tx.select().from(journalEntry).where(and(eq(journalEntry.cultureId, cultureId), isNull(journalEntry.deletedAt))).orderBy(desc(journalEntry.observedAt)).limit(JOURNAL_LIMIT);
  const photos = entries.length === 0 ? [] : await tx.select({ id: attachment.id, entryId: attachment.journalEntryId, width: attachment.width, height: attachment.height }).from(attachment)
    .where(and(inArray(attachment.journalEntryId, entries.map((e) => e.id)), isNull(attachment.deletedAt)));
  const harvests = await tx.select().from(harvest).where(and(eq(harvest.cultureId, cultureId), isNull(harvest.deletedAt))).orderBy(desc(harvest.harvestedOn));
  const z = await findZone(tx, scope, row.c.zoneId);
  const others = await tx.select({ id: culture.id, from: culture.occupiedFrom, to: culture.occupiedTo }).from(culture)
    .where(and(eq(culture.zoneId, row.c.zoneId), isNull(culture.deletedAt)));
  const alone = others.every((o) => o.id === cultureId || !periodsOverlap({ from: row.c.occupiedFrom, to: row.c.occupiedTo }, { from: o.from, to: o.to }));
  // Distances saisies pour la culture, sinon celles de l'espèce (RG-CUL-06).
  const planting = { spacingPlantCm: row.c.spacingPlantCm ?? row.sp.spacingPlantCm, spacingRowCm: row.c.spacingRowCm ?? row.sp.spacingRowCm, density: row.c.density, densityUnit: row.c.densityUnit };
  const area = cultureArea({ areaM2: row.c.areaM2, plantCount: row.c.plantCount, ...planting, zoneSurfaceM2: effectiveSurface(z).m2, aloneOnZone: alone });
  const totalKg = harvests.reduce((sum, h) => sum + (h.quantityKg ?? 0), 0);
  return {
    ...row, stages, area, planting: { ...planting, perM2: plantsPerM2(planting) }, totalKg: Math.round(totalKg * 1000) / 1000,
    journal: entries.map((e) => ({ ...e, photos: photos.filter((p) => p.entryId === e.id) })),
    harvests, warnings: orderWarnings(stages),
  };
}

export type CultureDetail = Awaited<ReturnType<typeof cultureDetail>>;

/** CUL-09 : cultures d'une zone (et de ses sous-zones) par saison, par recouvrement de l'occupation. */
export async function zoneHistory(tx: Executor, scope: Scope, zoneId: string) {
  const z = await findZone(tx, scope, zoneId);
  const g = await gardenInfo(tx, scope.gardenId);
  const ids = [z.id, ...(await findDescendants(tx, scope, z)).map((d) => d.id)];
  const rows = await tx.select({ id: culture.id, label: cultureLabel, status: culture.status, zoneName: zone.name, from: culture.occupiedFrom, to: culture.occupiedTo, seasonYear: season.year, familyCode: botanicalFamily.code, spriteKey: species.spriteKey })
    .from(culture).innerJoin(species, eq(species.id, culture.speciesId)).innerJoin(botanicalFamily, eq(botanicalFamily.id, species.familyId))
    .leftJoin(variety, eq(variety.id, culture.varietyId)).innerJoin(zone, eq(zone.id, culture.zoneId)).innerJoin(season, eq(season.id, culture.seasonId))
    .where(and(eq(culture.gardenId, scope.gardenId), inArray(culture.zoneId, ids), isNull(culture.deletedAt)));
  const bySeason = new Map<number, typeof rows>();
  for (const r of rows) {
    const years = r.from ? seasonYearsTouched(r.from, r.to, g.seasonStartMonth) : [r.seasonYear];
    for (const y of years) bySeason.set(y, [...(bySeason.get(y) ?? []), r]);
  }
  return [...bySeason.entries()].sort(([a], [b]) => b - a).map(([year, cultures]) => ({ year, cultures }));
}

/** Cultures en cours d'une zone (fiche zone). */
export async function activeCulturesOfZone(tx: Executor, scope: Scope, zoneId: string) {
  return tx.select({ id: culture.id, label: cultureLabel, status: culture.status }).from(culture)
    .innerJoin(species, eq(species.id, culture.speciesId)).leftJoin(variety, eq(variety.id, culture.varietyId))
    .where(and(eq(culture.gardenId, scope.gardenId), eq(culture.zoneId, zoneId), isNull(culture.deletedAt), inArray(culture.status, ['planned', 'active'])));
}

/**
 * RG-ROT-05 : frise des 5 dernières saisons par zone cultivable, avec les retours trop précoces.
 * Une cellule liste les familles présentes ; `early` marque une famille revenue avant son délai.
 */
export async function seasonGrid(tx: Executor, scope: Scope, lastYear: number, span = 5) {
  const g = await gardenInfo(tx, scope.gardenId);
  // Saison la plus récente en premier : c'est elle qu'on voit d'abord sur mobile.
  const years = Array.from({ length: span }, (_, i) => lastYear - i);
  const zones = await tx.select({ id: zone.id, name: zone.name, path: zone.path, depth: zone.depth, sortOrder: zone.sortOrder }).from(zone)
    .innerJoin(zoneType, eq(zoneType.id, zone.zoneTypeId))
    .where(and(eq(zone.gardenId, scope.gardenId), isNull(zone.archivedAt), eq(zoneType.canHostCultures, true)));
  const rows = await tx.select({ id: culture.id, zoneId: culture.zoneId, from: culture.occupiedFrom, to: culture.occupiedTo, seasonYear: season.year, familyCode: botanicalFamily.code, familyId: botanicalFamily.id, returnYears: botanicalFamily.rotationReturnYears, perennial: species.perennial, greenManure: species.greenManure, label: cultureLabel, spriteKey: species.spriteKey })
    .from(culture).innerJoin(species, eq(species.id, culture.speciesId)).innerJoin(botanicalFamily, eq(botanicalFamily.id, species.familyId))
    .leftJoin(variety, eq(variety.id, culture.varietyId)).innerJoin(season, eq(season.id, culture.seasonId))
    .where(and(
      eq(culture.gardenId, scope.gardenId), isNull(culture.deletedAt), isNotNull(culture.occupiedFrom),
      // Bornée aux saisons affichées (et au délai de retour maximal pour juger des retours précoces).
      or(isNull(culture.occupiedTo), sql`${culture.occupiedTo} >= ${`${lastYear - span - MAX_RETURN_YEARS}-01-01`}`),
    ));
  const yearsOf = (r: (typeof rows)[number]) => (r.from ? seasonYearsTouched(r.from, r.to, g.seasonStartMonth) : [r.seasonYear]);
  // Une culture compte pour sa zone, ses ancêtres et ses descendants (même logique que les alertes).
  const zoneChain = new Map(zones.map((z) => [z.id, [...(z.path ? z.path.split('/') : []), z.id]]));
  const related = (zoneA: string, zoneB: string) => (zoneChain.get(zoneA)?.includes(zoneB) ?? false) || (zoneChain.get(zoneB)?.includes(zoneA) ?? false);
  // Ordre de l'arbre : parent puis enfants, triés par ordre puis par nom.
  const byParent = new Map<string, typeof zones>();
  for (const z of zones) {
    const parent = z.path ? (z.path.split('/').pop() ?? '') : '';
    byParent.set(parent, [...(byParent.get(parent) ?? []), z]);
  }
  const ordered: typeof zones = [];
  const walk = (parent: string) => {
    for (const z of (byParent.get(parent) ?? []).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'fr'))) {
      ordered.push(z);
      walk(z.id);
    }
  };
  walk('');
  for (const z of zones) if (!ordered.includes(z)) ordered.push(z);
  return {
    years,
    rows: ordered.filter((z) => rows.some((r) => related(r.zoneId, z.id) && r.zoneId === z.id) || z.depth === 0).map((z) => ({
      zoneId: z.id, zoneName: z.name, depth: z.depth,
      cells: years.map((year) => {
        const here = rows.filter((r) => r.zoneId === z.id && yearsOf(r).includes(year));
        return {
          year,
          cultures: here.map((r) => {
            const early = !r.perennial && !r.greenManure && rows.some((o) => o.id !== r.id && o.familyId === r.familyId && related(o.zoneId, z.id) && !o.perennial
              && yearsOf(o).some((y) => y < year && y >= year - (r.returnYears - 1)));
            return { id: r.id, label: r.label, familyCode: r.familyCode, spriteKey: r.spriteKey, early };
          }),
        };
      }),
    })),
  };
}
