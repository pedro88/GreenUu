import type { TerrainCellKind } from '@/lib/enums';
import { cellKey } from './terrain.pure';

/*
 * Chemins des avatars entre deux zones (SPEC §9.5, LIV-03) : recherche A* sur la grille des tuiles de la scène. Les
 * planches, carrés, serres et autres structures sont évités (sauf la zone de départ et celle d'arrivée), l'eau, les
 * haies et les clôtures aussi ; les allées peintes coûtent moins cher que l'herbe, donc sont empruntées s'il en existe.
 * Unités : tuiles pour la grille, centimètres en entrée et en sortie.
 */

export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; w: number; h: number };
export type Obstacle = { rect: Rect; typeCode: string };

/** Types de zone qu'on ne traverse pas : on y entre seulement pour y travailler. */
export const BLOCKING_ZONE_TYPES: ReadonlySet<string> = new Set([
  'bed', 'row', 'square_bed', 'container', 'pot', 'greenhouse', 'tunnel', 'bench', 'seed_tray', 'cell', 'compost', 'fruit_hedge', 'flower_bed', 'nursery',
]);
const BLOCKING_CELLS: ReadonlySet<TerrainCellKind> = new Set(['water', 'hedge', 'fence']);
const PATH_CELLS: ReadonlySet<TerrainCellKind> = new Set(['path', 'gravel_path', 'stepping_stones']);
/** Au-delà, la grille serait trop coûteuse : on marche en ligne droite. */
const MAX_GRID_CELLS = 40_000;
const GRASS_COST = 3;
const PATH_COST = 1;

export type WalkGrid = { cols: number; rows: number; tileCm: number; cost: (x: number, y: number) => number };

/** Grille de marche d'une scène ; `open` liste les zones traversables malgré leur type (départ et arrivée). */
export function walkGrid(o: { bounds: { w: number; h: number }; tileCm: number; zones: Obstacle[]; cells: { x: number; y: number; kind: TerrainCellKind }[]; open?: Rect[] }): WalkGrid | null {
  const cols = Math.ceil(o.bounds.w / o.tileCm);
  const rows = Math.ceil(o.bounds.h / o.tileCm);
  if (cols * rows > MAX_GRID_CELLS) return null;
  const blocked = new Set<string>();
  const cheap = new Set<string>();
  const tilesOf = (r: Rect) => {
    const out: [number, number][] = [];
    for (let x = Math.floor(r.x / o.tileCm); x < Math.ceil((r.x + r.w) / o.tileCm); x += 1) for (let y = Math.floor(r.y / o.tileCm); y < Math.ceil((r.y + r.h) / o.tileCm); y += 1) out.push([x, y]);
    return out;
  };
  for (const z of o.zones) if (BLOCKING_ZONE_TYPES.has(z.typeCode)) for (const [x, y] of tilesOf(z.rect)) blocked.add(cellKey(x, y));
  for (const c of o.cells) {
    if (BLOCKING_CELLS.has(c.kind)) blocked.add(cellKey(c.x, c.y));
    if (PATH_CELLS.has(c.kind)) cheap.add(cellKey(c.x, c.y));
  }
  for (const r of o.open ?? []) for (const [x, y] of tilesOf(r)) blocked.delete(cellKey(x, y));
  return {
    cols, rows, tileCm: o.tileCm,
    cost: (x, y) => (x < 0 || y < 0 || x >= cols || y >= rows || blocked.has(cellKey(x, y)) ? Infinity : cheap.has(cellKey(x, y)) ? PATH_COST : GRASS_COST),
  };
}

/** Tas binaire minimal pour A* (clés et priorités dans deux tableaux parallèles). */
class Heap {
  private keys: number[] = [];
  private prio: number[] = [];
  get size() { return this.keys.length; }
  private swap(i: number, j: number) {
    const k = this.keys[i] ?? 0;
    const f = this.prio[i] ?? 0;
    this.keys[i] = this.keys[j] ?? 0;
    this.prio[i] = this.prio[j] ?? 0;
    this.keys[j] = k;
    this.prio[j] = f;
  }
  push(k: number, f: number) {
    this.keys.push(k);
    this.prio.push(f);
    let i = this.keys.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if ((this.prio[p] ?? 0) <= f) break;
      this.swap(i, p);
      i = p;
    }
  }
  pop(): number {
    const top = this.keys[0] ?? -1;
    const n = this.keys.length - 1;
    this.swap(0, n);
    this.keys.pop();
    this.prio.pop();
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      if (l < n && (this.prio[l] ?? Infinity) < (this.prio[m] ?? Infinity)) m = l;
      if (r < n && (this.prio[r] ?? Infinity) < (this.prio[m] ?? Infinity)) m = r;
      if (m === i) break;
      this.swap(i, m);
      i = m;
    }
    return top;
  }
}

/**
 * Chemin de `from` à `to` (centimètres), par les centres des tuiles, 4 directions. Sans grille ou sans chemin : la ligne
 * droite (l'avatar ne reste jamais bloqué).
 */
export function findPath(grid: WalkGrid | null, from: Point, to: Point): Point[] {
  if (!grid) return [from, to];
  const t = grid.tileCm;
  const sx = Math.min(grid.cols - 1, Math.max(0, Math.floor(from.x / t)));
  const sy = Math.min(grid.rows - 1, Math.max(0, Math.floor(from.y / t)));
  const gx = Math.min(grid.cols - 1, Math.max(0, Math.floor(to.x / t)));
  const gy = Math.min(grid.rows - 1, Math.max(0, Math.floor(to.y / t)));
  const id = (x: number, y: number) => y * grid.cols + x;
  const goal = id(gx, gy);
  const g = new Map<number, number>([[id(sx, sy), 0]]);
  const came = new Map<number, number>();
  const open = new Heap();
  const h = (x: number, y: number) => (Math.abs(x - gx) + Math.abs(y - gy)) * PATH_COST;
  open.push(id(sx, sy), h(sx, sy));
  const closed = new Set<number>();
  while (open.size) {
    const cur = open.pop();
    if (cur === goal) break;
    if (closed.has(cur)) continue;
    closed.add(cur);
    const cx = cur % grid.cols;
    const cy = Math.floor(cur / grid.cols);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = cx + dx;
      const ny = cy + dy;
      const step = grid.cost(nx, ny);
      if (step === Infinity && id(nx, ny) !== goal) continue;
      const n = id(nx, ny);
      const cost = (g.get(cur) ?? 0) + (step === Infinity ? GRASS_COST : step);
      if (cost < (g.get(n) ?? Infinity)) {
        g.set(n, cost);
        came.set(n, cur);
        open.push(n, cost + h(nx, ny));
      }
    }
  }
  if (!came.has(goal) && goal !== id(sx, sy)) return [from, to];
  const tiles: number[] = [];
  for (let k: number | undefined = goal; k !== undefined && k !== id(sx, sy); k = came.get(k)) tiles.unshift(k);
  const centers = tiles.map((k) => ({ x: (k % grid.cols) * t + t / 2, y: Math.floor(k / grid.cols) * t + t / 2 }));
  // On ne garde que les coudes : le trajet reste le même, en moins de points.
  const path = [from, ...centers.slice(0, -1), to];
  return path.filter((p, i) => {
    const a = path[i - 1];
    const b = path[i + 1];
    return !a || !b || (a.x - p.x) * (b.y - p.y) !== (a.y - p.y) * (b.x - p.x);
  });
}
