import type { RectGeometry } from '../zone/tree';
import { rectContains } from '../zone/tree';

/* Grille du plan (SPEC §9.6, §9.7) : la géométrie est en centimètres, la tuile n'est qu'une échelle d'affichage. */

export const TILE_SIZES_CM = [10, 25, 50, 100] as const;
export type TileSizeCm = (typeof TILE_SIZES_CM)[number];
/** Taille d'une tuile à l'écran, à l'échelle 1 (§9.2). */
export const TILE_PX = 32;

export type Tile = { x: number; y: number };

/** Rectangle couvrant deux tuiles (incluses), dans n'importe quel ordre de glisser. */
export function tilesToGeometry(a: Tile, b: Tile, tileCm: number): RectGeometry {
  const x0 = Math.min(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  return { v: 1, kind: 'rect', x: x0 * tileCm, y: y0 * tileCm, w: (Math.abs(a.x - b.x) + 1) * tileCm, h: (Math.abs(a.y - b.y) + 1) * tileCm };
}

/** Emprise d'une géométrie en tuiles (fractionnaire si la géométrie n'est pas alignée sur l'échelle courante, PLN-07). */
export function geometryInTiles(g: RectGeometry, tileCm: number): { x: number; y: number; w: number; h: number } {
  return { x: g.x / tileCm, y: g.y / tileCm, w: g.w / tileCm, h: g.h / tileCm };
}

/** Tuile sous un point de la scène, en centimètres. */
export function tileAt(cmX: number, cmY: number, tileCm: number): Tile {
  return { x: Math.floor(cmX / tileCm), y: Math.floor(cmY / tileCm) };
}

export const areaM2 = (g: RectGeometry) => Math.round((g.w * g.h) / 100) / 100;

/** Parent déduit d'un rectangle dessiné : la zone la plus profonde de la scène qui le contient entièrement (§9.7). */
export function deduceParent<T extends { id: string; depth: number; geometry: RectGeometry | null }>(rect: RectGeometry, zones: T[]): T | null {
  return zones.filter((z) => z.geometry && rectContains(z.geometry, rect)).sort((a, b) => b.depth - a.depth)[0] ?? null;
}

/**
 * Positions des cultures dans le rectangle de leur zone : une grille régulière de cases, au centre de chacune.
 * Les cultures n'ont pas de géométrie propre en V1 ; on les répartit pour qu'elles restent toutes touchables.
 */
export function layoutInRect(rect: RectGeometry, count: number): { x: number; y: number }[] {
  if (count <= 0) return [];
  const cols = Math.max(1, Math.round(Math.sqrt((count * rect.w) / rect.h)));
  const rows = Math.ceil(count / cols);
  return Array.from({ length: count }, (_, i) => ({
    x: Math.round(rect.x + ((i % cols) + 0.5) * (rect.w / cols)),
    y: Math.round(rect.y + (Math.floor(i / cols) + 0.5) * (rect.h / rows)),
  }));
}

/** Emprise de la scène (origine en 0, 0), avec une marge d'une tuile, pour la caméra et la grille de l'éditeur. */
export function sceneBounds(rects: RectGeometry[], tileCm: number, min = { w: 20, h: 12 }): { w: number; h: number } {
  const w = Math.max(min.w * tileCm, ...rects.map((r) => r.x + r.w + tileCm));
  const h = Math.max(min.h * tileCm, ...rects.map((r) => r.y + r.h + tileCm));
  return { w: Math.ceil(w / tileCm) * tileCm, h: Math.ceil(h / tileCm) * tileCm };
}
