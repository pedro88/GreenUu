import type { DensityUnit } from '@/lib/enums';
import { cultureArea, estimatedPlantCount, plantsPerM2 } from '../culture/stages.pure';

/*
 * Remplissage des parcelles (SPEC §9.2, §12.11, FIL-01 à 06) : combien de plants dessiner pour une culture, quelle bande
 * de sa zone elle occupe, et où poser chaque plant. Fonctions pures, déterministes (aucun aléatoire au rendu).
 * Unités : centimètres de la scène.
 */

export type Rect = { x: number; y: number; w: number; h: number };
export type PlantSpot = { x: number; y: number; mirror: boolean; alt: boolean };

/**
 * Plafonds d'affichage (FIL-06). Les plants dessinés remplissent la bande de la culture, environ un par tuile : ils
 * ne représentent pas chaque plant réel (décision de l'utilisateur du 2026-10-05) ; le vrai nombre reste annoncé.
 */
export const PLANTS_PER_TILE = 1;
export const MAX_PLANTS_PER_CULTURE = 48;
export const MAX_PLANTS_PER_SCENE = 200;
/** Sans nombre, ni surface, ni distances : quelques plants, pour que la culture se voie. */
export const DEFAULT_PLANTS = 6;

export type PlantingFacts = {
  plantCount: number | null; areaM2: number | null; spacingPlantCm: number | null; spacingRowCm: number | null;
  density: number | null; densityUnit: DensityUnit | null;
};

/**
 * Nombre réel (saisi) ou estimé de plants d'une culture : saisi ; sinon surface (saisie, sinon celle de la bande qu'elle
 * occupe) × densité (RG-CUL-06) ; sinon un défaut.
 */
export function plantCountOf(f: PlantingFacts, bandM2: number): { count: number; source: 'input' | 'estimated' | 'default' } {
  if (f.plantCount) return { count: f.plantCount, source: 'input' };
  const area = cultureArea({ ...f, plantCount: null, zoneSurfaceM2: bandM2, aloneOnZone: true }).m2;
  const estimate = estimatedPlantCount(area, plantsPerM2(f));
  return estimate ? { count: estimate, source: 'estimated' } : { count: DEFAULT_PLANTS, source: 'default' };
}

/**
 * Bandes d'une zone partagée par plusieurs cultures (FIL-03) : découpée le long de son grand côté, chaque culture prend
 * une part proportionnelle à son poids (surface, sinon nombre de plants), sans chevauchement.
 */
export function bands(rect: Rect, weights: number[]): Rect[] {
  const total = weights.reduce((s, w) => s + Math.max(w, 0.0001), 0);
  const horizontal = rect.w >= rect.h;
  let at = horizontal ? rect.x : rect.y;
  return weights.map((w, i) => {
    const size = i === weights.length - 1 ? (horizontal ? rect.x + rect.w : rect.y + rect.h) - at : ((horizontal ? rect.w : rect.h) * Math.max(w, 0.0001)) / total;
    const band = horizontal ? { x: at, y: rect.y, w: size, h: rect.h } : { x: rect.x, y: at, w: rect.w, h: size };
    at += size;
    return band;
  });
}

/**
 * Surface plantable d'une zone : planches et carrés ont un bord en bois sur leur rangée du bas, qui ne reçoit pas de
 * plants (décision de l'utilisateur du 2026-10-05).
 */
export function plantableRect(rect: Rect, typeCode: string | undefined, tileCm: number): Rect {
  if ((typeCode === 'bed' || typeCode === 'square_bed') && rect.h > tileCm) return { ...rect, h: rect.h - tileCm };
  return rect;
}

/** Plants à dessiner pour remplir une bande (FIL-01) : environ un par tuile, au moins un. */
export function fillCount(band: Rect, tileCm: number): number {
  return Math.max(1, Math.round(((band.w * band.h) / (tileCm * tileCm)) * PLANTS_PER_TILE));
}

/**
 * Plants dessinés par culture (FIL-06) : au plus 48 par culture et 200 par scène ; chaque culture garde au moins
 * un plant.
 */
export function drawnCounts(counts: number[]): number[] {
  const capped = counts.map((c) => Math.max(1, Math.min(MAX_PLANTS_PER_CULTURE, c)));
  const total = capped.reduce((s, c) => s + c, 0);
  if (total <= MAX_PLANTS_PER_SCENE) return capped;
  const ratio = MAX_PLANTS_PER_SCENE / total;
  const scaled = capped.map((c) => Math.max(1, Math.floor(c * ratio)));
  // Le plancher d'un plant peut faire dépasser : on retire aux plus grandes jusqu'à tenir.
  let over = scaled.reduce((s, c) => s + c, 0) - MAX_PLANTS_PER_SCENE;
  while (over > 0) {
    const i = scaled.indexOf(Math.max(...scaled));
    if ((scaled[i] ?? 1) <= 1) break;
    scaled[i] = (scaled[i] ?? 1) - 1;
    over -= 1;
  }
  return scaled;
}

/** Hachage déterministe d'une chaîne et d'un index, dans [0, 1). */
function hash01(seed: string, i: number): number {
  let h = 2166136261 ^ i;
  for (let k = 0; k < seed.length; k += 1) h = Math.imul(h ^ seed.charCodeAt(k), 16777619);
  h = Math.imul(h ^ (h >>> 15), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Positions des plants dans la bande de la culture (FIL-01, FIL-04) : rangs parallèles au grand côté, en quinconce d'un
 * rang à l'autre, avec un léger décalage, un miroir et une variante tirés de `(seed, index)`. Le pied des plants est
 * au point donné.
 */
export function plantSpots(seed: string, rect: Rect, n: number, tileCm: number): PlantSpot[] {
  if (n <= 0) return [];
  const long = Math.max(rect.w, rect.h);
  const short = Math.min(rect.w, rect.h);
  const rows = Math.max(1, Math.min(n, Math.round(Math.sqrt((n * short) / long))));
  const perRow = Math.ceil(n / rows);
  const jitter = tileCm * 0.06;
  const out: PlantSpot[] = [];
  for (let i = 0; i < n; i += 1) {
    const r = Math.floor(i / perRow);
    const inRow = r === rows - 1 ? n - perRow * (rows - 1) : perRow;
    const c = i % perRow;
    const stagger = r % 2 === 1 && inRow > 1 ? 0.25 : 0;
    const along = ((c + 0.5 + stagger) / inRow) * long;
    const across = ((r + 0.5) / rows) * short;
    const dx = (hash01(seed, i * 3) - 0.5) * 2 * jitter;
    const dy = (hash01(seed, i * 3 + 1) - 0.5) * 2 * jitter;
    const horizontal = rect.w >= rect.h;
    // Pied du plant : un peu sous le centre de sa case (vers le bas de l'écran), pour que le feuillage reste dans la bande.
    const down = horizontal ? short / rows / 3 : long / perRow / 3;
    const x = horizontal ? along : across;
    const y = Math.min(rect.h, (horizontal ? across : along) + down);
    out.push({
      x: Math.round(rect.x + x + dx),
      y: Math.round(rect.y + y + dy),
      mirror: hash01(seed, i * 3 + 2) < 0.5,
      alt: hash01(seed, i * 7 + 5) < 0.4,
    });
  }
  return out;
}

export type CulturePlacement = { footprint: Rect; position: { x: number; y: number }; plants: { count: number; drawn: number; source: 'input' | 'estimated' | 'default' } };

/**
 * Place les cultures d'une scène (FIL-01 à 06) : les cultures d'une même zone ancre se partagent ses bandes, chacune
 * remplit la sienne de plants, et le total dessiné reste sous le plafond de la scène. Partagé par l'instantané de la vue
 * jardin et par l'histoire du jardin.
 */
export function layoutCultures(items: { id: string; anchor: { id: string; rect: Rect } | null; facts: PlantingFacts }[], tileCm: number): Map<string, CulturePlacement> {
  const byAnchor = new Map<string, { rect: Rect; items: typeof items }>();
  for (const it of items) {
    if (!it.anchor) continue;
    const g = byAnchor.get(it.anchor.id) ?? { rect: it.anchor.rect, items: [] };
    g.items.push(it);
    byAnchor.set(it.anchor.id, g);
  }
  const out = new Map<string, CulturePlacement>();
  for (const { rect, items: group } of byAnchor.values()) {
    bands(rect, group.map((it) => it.facts.areaM2 ?? it.facts.plantCount ?? 1)).forEach((band, i) => {
      const it = group[i];
      if (!it) return;
      const footprint = { x: Math.round(band.x), y: Math.round(band.y), w: Math.max(1, Math.round(band.w)), h: Math.max(1, Math.round(band.h)) };
      const n = plantCountOf(it.facts, (band.w * band.h) / 10_000);
      out.set(it.id, { footprint, position: { x: Math.round(band.x + band.w / 2), y: Math.round(band.y + band.h / 2) }, plants: { count: n.count, drawn: 0, source: n.source } });
    });
  }
  const placed = [...out.values()];
  drawnCounts(placed.map((p) => fillCount(p.footprint, tileCm))).forEach((d, i) => { const p = placed[i]; if (p) p.plants.drawn = d; });
  return out;
}
