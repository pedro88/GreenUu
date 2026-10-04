import type { HARVEST_UNITS } from '@/lib/enums';
import { seasonYearOf } from '../season/season.pure';

/*
 * Statistiques pluriannuelles (SPEC §12.10, STAT) : agrégats purs à partir des récoltes et des cultures d'un jardin.
 * Une récolte compte pour la saison culturale qui contient sa date (le jardin peut commencer sa saison hors janvier,
 * STAT-04) : une vivace répartit naturellement ses récoltes sur ses saisons (STAT-05). Les kilos viennent de
 * `quantity_kg` (conversion RG-JRN-05, faite à l'enregistrement) ; le reste est compté à part, par unité (STAT-02).
 */

type Unit = (typeof HARVEST_UNITS)[number];

export type HarvestRow = {
  speciesId: string; speciesName: string; zoneId: string; zoneName: string; areaM2: number | null;
  harvestedOn: string; quantity: number; unit: Unit; quantityKg: number | null;
};

export type Cell = { kg: number; harvests: number; other: Partial<Record<Unit, number>> };
export type ZoneCell = Cell & { kgPerM2: number | null };

const emptyCell = (): Cell => ({ kg: 0, harvests: 0, other: {} });

function cellOf(m: Map<number, Cell>, year: number): Cell {
  let c = m.get(year);
  if (!c) { c = emptyCell(); m.set(year, c); }
  return c;
}
const round = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;

function add(c: Cell, h: HarvestRow) {
  c.harvests += 1;
  if (h.quantityKg !== null) c.kg = round(c.kg + h.quantityKg, 3);
  else c.other[h.unit] = round((c.other[h.unit] ?? 0) + h.quantity, 3);
}

/** Libellé d'une saison : l'année si elle commence en janvier, sinon « 2025-2026 ». */
export const seasonLabel = (year: number, startMonth: number) => (startMonth === 1 ? String(year) : `${year}-${year + 1}`);

export function yields(rows: HarvestRow[], startMonth: number) {
  const seasons = [...new Set(rows.map((r) => seasonYearOf(r.harvestedOn, startMonth)))].sort((a, b) => a - b);
  const species = new Map<string, { id: string; name: string; perSeason: Map<number, Cell> }>();
  const zones = new Map<string, { id: string; name: string; areaM2: number | null; perSeason: Map<number, Cell> }>();
  for (const r of rows) {
    const y = seasonYearOf(r.harvestedOn, startMonth);
    const s = species.get(r.speciesId) ?? { id: r.speciesId, name: r.speciesName, perSeason: new Map<number, Cell>() };
    species.set(r.speciesId, s);
    add(cellOf(s.perSeason, y), r);
    const z = zones.get(r.zoneId) ?? { id: r.zoneId, name: r.zoneName, areaM2: r.areaM2, perSeason: new Map<number, Cell>() };
    zones.set(r.zoneId, z);
    add(cellOf(z.perSeason, y), r);
  }
  const total = (m: Map<number, Cell>) => [...m.values()].reduce((a, c) => a + c.kg, 0);
  return {
    seasons,
    bySpecies: [...species.values()].sort((a, b) => total(b.perSeason) - total(a.perSeason) || a.name.localeCompare(b.name)),
    // kg/m² seulement si la zone a une surface (STAT-03).
    byZone: [...zones.values()].map((z) => ({
      ...z, perSeason: new Map([...z.perSeason].map(([y, c]): [number, ZoneCell] => [y, { ...c, kgPerM2: z.areaM2 ? round(c.kg / z.areaM2) : null }])),
    })).sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/** Évolution d'une saison à la précédente, en pourcentage arrondi ; null sans base de comparaison. */
export function trend(current: number | undefined, previous: number | undefined): number | null {
  if (current === undefined || previous === undefined || previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export type CultureOutcome = { speciesId: string; speciesName: string; seasonYear: number; status: 'planned' | 'active' | 'finished' | 'failed' | 'abandoned' };

/** Réussites par espèce et par saison (STAT-06) : terminées / (terminées + échouées + abandonnées) ; les cultures en cours n'entrent pas. */
export function successRates(rows: CultureOutcome[]) {
  const out = new Map<string, { id: string; name: string; perSeason: Map<number, { finished: number; failed: number; abandoned: number; rate: number }> }>();
  for (const r of rows) {
    if (r.status === 'planned' || r.status === 'active') continue;
    const s = out.get(r.speciesId) ?? { id: r.speciesId, name: r.speciesName, perSeason: new Map() };
    out.set(r.speciesId, s);
    const c = s.perSeason.get(r.seasonYear) ?? { finished: 0, failed: 0, abandoned: 0, rate: 0 };
    c[r.status] += 1;
    c.rate = Math.round((100 * c.finished) / (c.finished + c.failed + c.abandoned));
    s.perSeason.set(r.seasonYear, c);
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Export CSV (STAT-07) : une ligne par espèce, zone et saison ; séparateur `;` et virgule décimale (tableurs francophones). */
export function statsCsv(rows: HarvestRow[], startMonth: number): string {
  const esc = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const num = (n: number | null) => (n === null ? '' : String(n).replace('.', ','));
  const lines = new Map<string, { season: number; species: string; zone: string; areaM2: number | null; cell: Cell }>();
  for (const r of rows) {
    const season = seasonYearOf(r.harvestedOn, startMonth);
    const key = `${season}|${r.speciesId}|${r.zoneId}`;
    const l = lines.get(key) ?? { season, species: r.speciesName, zone: r.zoneName, areaM2: r.areaM2, cell: emptyCell() };
    lines.set(key, l);
    add(l.cell, r);
  }
  const body = [...lines.values()].sort((a, b) => a.season - b.season || a.species.localeCompare(b.species) || a.zone.localeCompare(b.zone)).map((l) => [
    seasonLabel(l.season, startMonth), esc(l.species), esc(l.zone), num(l.cell.kg), num(l.areaM2 ? round(l.cell.kg / l.areaM2) : null), String(l.cell.harvests),
    esc(Object.entries(l.cell.other).map(([u, q]) => `${num(q ?? 0)} ${u}`).join(', ')),
  ].join(';'));
  return ['saison;espece;zone;kg;kg_m2;recoltes;autres_unites', ...body].join('\n') + '\n';
}
