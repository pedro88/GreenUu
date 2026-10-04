import type { TerrainCellKind } from '@/lib/enums';

/*
 * Terrain peint case par case (SPEC §4.2.6, §9.7, lot 9) : opérations pures sur les cases, partagées par le serveur et
 * par l'éditeur (application optimiste, annuler / rétablir, rejeu après `CONFLICT`). Une case = une tuile de l'échelle
 * courante, un seul type.
 */

export type Cell = { x: number; y: number; kind: TerrainCellKind };
export type CellPos = [number, number];

/** Nombre maximal de cases par commande `paintTerrain` / `eraseTerrain` (PNT-07). */
export const MAX_CELLS_PER_COMMAND = 2500;
/** Coordonnée maximale d'une case, en tuiles (contrainte `terrain_cell_position_ck`). */
export const MAX_CELL_COORD = 10_000;

export const cellKey = (x: number, y: number) => `${x},${y}`;

/** Peint des cases : une case déjà peinte change de type, sans doublon. */
export function paintCells(cells: readonly Cell[], at: readonly CellPos[], kind: TerrainCellKind): Cell[] {
  const map = new Map(cells.map((c) => [cellKey(c.x, c.y), c]));
  for (const [x, y] of at) map.set(cellKey(x, y), { x, y, kind });
  return [...map.values()];
}

export function eraseCells(cells: readonly Cell[], at: readonly CellPos[]): Cell[] {
  const gone = new Set(at.map(([x, y]) => cellKey(x, y)));
  return cells.filter((c) => !gone.has(cellKey(c.x, c.y)));
}

/**
 * Changement d'échelle (PNT-06) : chaque case de la nouvelle grille prend le type de l'ancienne case qui contient son
 * centre. Plus fin, une case devient plusieurs ; plus grossier, on échantillonne. Le dessin ne bouge pas par rapport
 * aux zones, dont la géométrie est en centimètres.
 */
export function resampleCells(cells: readonly Cell[], fromCm: number, toCm: number): Cell[] {
  if (fromCm === toCm || !cells.length) return [...cells];
  const old = new Map(cells.map((c) => [cellKey(c.x, c.y), c.kind]));
  const out: Cell[] = [];
  const seen = new Set<string>();
  for (const c of cells) {
    // Nouvelles cases qui recoupent l'ancienne : on ne garde que celles dont le centre y tombe.
    const x0 = Math.floor((c.x * fromCm) / toCm);
    const x1 = Math.ceil(((c.x + 1) * fromCm) / toCm) - 1;
    const y0 = Math.floor((c.y * fromCm) / toCm);
    const y1 = Math.ceil(((c.y + 1) * fromCm) / toCm) - 1;
    for (let x = x0; x <= x1; x += 1) {
      for (let y = y0; y <= y1; y += 1) {
        const k = cellKey(x, y);
        if (seen.has(k)) continue;
        const kind = old.get(cellKey(Math.floor(((x + 0.5) * toCm) / fromCm), Math.floor(((y + 0.5) * toCm) / fromCm)));
        if (!kind) continue;
        seen.add(k);
        out.push({ x, y, kind });
      }
    }
  }
  return out;
}

/** Cases d'un pinceau carré de `size` × `size` à partir d'une case (coin haut-gauche), bornées à la grille. */
export function brushCells(at: { x: number; y: number }, size: 1 | 2 | 3): CellPos[] {
  const out: CellPos[] = [];
  for (let dx = 0; dx < size; dx += 1) for (let dy = 0; dy < size; dy += 1) {
    const x = at.x + dx;
    const y = at.y + dy;
    if (x >= 0 && y >= 0 && x <= MAX_CELL_COORD && y <= MAX_CELL_COORD) out.push([x, y]);
  }
  return out;
}

/** Cases d'un rectangle entre deux cases (incluses), dans n'importe quel ordre de glisser. */
export function rectCells(a: { x: number; y: number }, b: { x: number; y: number }): CellPos[] {
  const out: CellPos[] = [];
  for (let x = Math.max(0, Math.min(a.x, b.x)); x <= Math.min(MAX_CELL_COORD, Math.max(a.x, b.x)); x += 1) {
    for (let y = Math.max(0, Math.min(a.y, b.y)); y <= Math.min(MAX_CELL_COORD, Math.max(a.y, b.y)); y += 1) out.push([x, y]);
  }
  return out;
}

/** Emprise des cases en centimètres, pour le cadrage de la scène. */
export function cellsRect(cells: readonly Cell[], tileCm: number): { v: 1; kind: 'rect'; x: number; y: number; w: number; h: number } | null {
  if (!cells.length) return null;
  const xs = cells.map((c) => c.x);
  const ys = cells.map((c) => c.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { v: 1, kind: 'rect', x: x * tileCm, y: y * tileCm, w: (Math.max(...xs) - x + 1) * tileCm, h: (Math.max(...ys) - y + 1) * tileCm };
}
