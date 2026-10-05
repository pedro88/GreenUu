import type { CultureStatus, Method, Stage, VisualModel } from '@/lib/enums';
import { DECOR_BY_CODE } from '../decor/catalog';
import { astronomicalSeason } from '../progression/quests.pure';
import { layoutCultures, plantableRect, type PlantingFacts } from './fill.pure';
import { decorRect, sceneBounds } from './grid.pure';
import type { PlanSnapshotV1 } from './history.schema';
import { orderStates, visualPhase } from './phase.pure';
import type { SceneSnapshot, SceneZone } from './snapshot.schema';
import { cellsRect } from './terrain.pure';

/*
 * Histoire du jardin (SPEC §12.11, TLP) : les images du timelapse, calculées côté client à partir des instantanés du
 * plan et des étapes réelles des cultures. Chaque image est un instantané de scène ordinaire : le moteur de la vue
 * jardin l'affiche tel quel. Fonctions pures, sans base.
 */

export type HistoryStep = 'day' | 'week' | 'month';
export const MAX_FRAMES = 160;
export const MAX_YEARS = 3;

export type HistoryCulture = {
  id: string; zoneId: string; label: string; spriteKeys: string[]; method: Method; perennial: boolean; visualModel: VisualModel;
  stages: { stage: Stage; plannedOn: string | null; actualOn: string | null }[];
  facts: PlantingFacts;
};

export type HistoryData = {
  gardenId: string; gardenName: string; south: boolean; today: string;
  /** Préférence « animations réduites » du profil (TLP-06). */
  reducedMotion: boolean;
  /** Instantanés du plan, du plus ancien au plus récent. */
  snapshots: { takenOn: string; payload: PlanSnapshotV1 }[];
  current: PlanSnapshotV1;
  cultures: HistoryCulture[];
};

const addIsoDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const addMonths = (iso: string, n: number) => {
  const [y = 2000, m = 1, d = 1] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
};

/**
 * Dates des images (TLP-07) : de `from` à `to` incluses, au pas choisi, sur 3 ans au plus ; au-delà de 160 images, on
 * garde les plus récentes. Un mois garde le même quantième (borné à la fin du mois).
 */
export function frameDates(from: string, to: string, step: HistoryStep): string[] {
  const floor = addMonths(to, -12 * MAX_YEARS);
  let d = from < floor ? floor : from;
  const out: string[] = [];
  for (let i = 0; d <= to && i < 2000; i += 1) {
    out.push(d);
    d = step === 'day' ? addIsoDays(d, 1) : step === 'week' ? addIsoDays(d, 7) : addMonths(from < floor ? floor : from, i + 1);
  }
  return out.slice(-MAX_FRAMES);
}

/** Plan en vigueur à une date : le dernier instantané pris ce jour-là ou avant ; sinon le plan actuel, reconstitué (TLP-03). */
export function planAt(data: HistoryData, date: string): { plan: PlanSnapshotV1; reconstructed: boolean } {
  let found: PlanSnapshotV1 | null = null;
  for (const s of data.snapshots) if (s.takenOn <= date) found = s.payload;
  return found ? { plan: found, reconstructed: false } : { plan: data.current, reconstructed: true };
}

/** Statut d'une culture à une date, d'après ses étapes réelles. */
function statusAt(c: HistoryCulture, date: string): CultureStatus {
  if (c.stages.some((s) => s.stage === 'end' && s.actualOn && s.actualOn <= date)) return 'finished';
  return c.stages.some((s) => s.actualOn && s.actualOn <= date) ? 'active' : 'planned';
}

/** Emprise stable de toutes les images : la caméra ne saute pas d'une image à l'autre. */
export function historyBounds(data: HistoryData): { w: number; h: number } {
  const plans = [data.current, ...data.snapshots.map((s) => s.payload)];
  const tile = data.current.tileSizeCm;
  const rects = plans.flatMap((p) => [
    ...p.zones.flatMap((z) => (z.sceneZoneId === null && z.geometry ? [z.geometry] : [])),
    ...p.terrain.flatMap((t) => {
      if (t.sceneZoneId !== null) return [];
      const r = cellsRect(t.cells.map(([x, y]) => ({ x, y, kind: t.kind })), p.tileSizeCm);
      return r ? [r] : [];
    }),
  ]);
  return sceneBounds(rects, tile);
}

/**
 * Image du timelapse à une date (TLP-02, TLP-04) : le plan en vigueur (scène extérieure), sans les zones archivées à
 * cette date ; les cultures dont la période a commencé, dans leur phase réelle à cette date ; les avatars n'y sont pas.
 */
export function sceneAt(data: HistoryData, date: string, o: { bounds: { w: number; h: number }; reducedMotion: boolean }): { scene: SceneSnapshot; reconstructed: boolean } {
  const { plan, reconstructed } = planAt(data, date);
  const alive = plan.zones.filter((z) => z.sceneZoneId === null && (!z.archivedAt || z.archivedAt.slice(0, 10) > date));
  const byId = new Map(alive.map((z) => [z.id, z]));
  const depthOf = (id: string | null, n = 0): number => (id && byId.has(id) && n < 20 ? depthOf(byId.get(id)?.parentId ?? null, n + 1) : n);
  const zones: SceneZone[] = alive.map((z) => {
    const parent = z.parentId ? byId.get(z.parentId) : undefined;
    return {
      id: z.id, name: z.name, typeCode: z.typeCode, parentId: z.parentId, depth: depthOf(z.parentId), geometry: z.geometry, hasInterior: false, canHostCultures: true,
      label: parent ? `${z.name}, ${parent.name}` : z.name,
    };
  });
  // Zone ancre : celle de la culture, ou son ancêtre le plus proche placé à cette date.
  const anchorOf = (zoneId: string) => {
    for (let z = byId.get(zoneId), n = 0; z && n < 20; z = z.parentId ? byId.get(z.parentId) : undefined, n += 1) if (z.geometry) return { id: z.id, rect: plantableRect(z.geometry, z.typeCode, plan.tileSizeCm) };
    return null;
  };
  const visible = data.cultures.flatMap((c) => {
    const started = c.stages.some((s) => (s.actualOn ?? s.plannedOn ?? '9999') <= date);
    if (!started || !byId.has(c.zoneId)) return [];
    const stages = c.stages.map((s) => ({ ...s, actualOn: s.actualOn && s.actualOn <= date ? s.actualOn : null }));
    const status = statusAt(c, date);
    const endedOn = stages.find((s) => s.stage === 'end')?.actualOn ?? null;
    const p = visualPhase({ method: c.method, status, perennial: c.perennial, visualModel: c.visualModel, stages, endedOn }, date, { south: data.south });
    return p.visible ? [{ c, p }] : [];
  });
  const layout = layoutCultures(visible.map(({ c }) => ({ id: c.id, anchor: anchorOf(c.zoneId), facts: c.facts })), plan.tileSizeCm);
  const cultures: SceneSnapshot['cultures'] = visible.map(({ c, p }) => {
    const l = layout.get(c.id);
    return {
      id: c.id, zoneId: c.zoneId, label: c.label, spriteKeys: c.spriteKeys, phase: p.phase, progress: p.progress, states: orderStates(new Set()),
      position: l?.position ?? null, footprint: l?.footprint ?? null, plants: l?.plants ?? { count: 1, drawn: 0, source: 'default' },
    };
  });
  const terrain = plan.terrain.filter((t) => t.sceneZoneId === null).flatMap((t) => t.cells.map(([x, y]) => ({ x, y, kind: t.kind })));
  const decor: SceneSnapshot['decor'] = plan.objects.filter((d) => d.sceneZoneId === null).flatMap((d) => {
    const item = DECOR_BY_CODE.get(d.itemCode);
    return item ? [{ id: d.id, itemCode: d.itemCode, spriteKey: item.spriteKey, w: item.w, h: item.h, x: d.x, y: d.y, label: d.label, practiceCode: null, practiceDeclared: false }] : [];
  });
  const bounds = { w: Math.max(o.bounds.w, ...decor.map((d) => decorRect(d, plan.tileSizeCm)).map((r) => r.x + r.w)), h: o.bounds.h };
  return {
    reconstructed,
    scene: {
      gardenId: data.gardenId, gardenName: data.gardenName, sceneZoneId: null, breadcrumb: [{ zoneId: null, name: data.gardenName }], planVersion: 0,
      tileSizeCm: plan.tileSizeCm, bounds, zones, terrain, cultures, decor, avatars: [],
      ambient: { period: 'day', season: astronomicalSeason(date, data.south), tint: 0, alpha: 0 },
      viewer: { canEditPlan: false, canPlaceDecor: false, canDeclarePractice: false, reducedMotion: o.reducedMotion },
    },
  };
}
