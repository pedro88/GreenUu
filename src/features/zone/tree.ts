/** Fonctions pures sur l'arbre des zones (SPEC §4.3, RG-ZON-01, 03, 04, 05). */

export const MAX_ZONE_DEPTH = 8;

/** `path` = IDs des ancêtres séparés par « / », vide pour une racine. */
export function childPath(parent: { id: string; path: string } | null): string {
  if (!parent) return '';
  return parent.path ? `${parent.path}/${parent.id}` : parent.id;
}

export function ancestorIds(path: string): string[] {
  return path ? path.split('/') : [];
}

export function depthOf(path: string): number {
  return ancestorIds(path).length;
}

/** Vrai si `candidateParent` est la zone elle-même ou l'un de ses descendants. */
export function wouldCreateCycle(zoneId: string, candidateParent: { id: string; path: string }): boolean {
  return candidateParent.id === zoneId || ancestorIds(candidateParent.path).includes(zoneId);
}

/** Profondeur maximale (relative) du sous-arbre d'une zone, 0 si feuille. */
export function subtreeHeight(zone: { id: string; path: string }, descendants: { path: string }[]): number {
  const base = depthOf(childPath(zone));
  return descendants.reduce((max, d) => Math.max(max, depthOf(d.path) - base + 1), 0);
}

export type Environment =
  | 'open_air'
  | 'greenhouse'
  | 'tunnel'
  | 'indoor'
  | 'soilless'
  | 'hydroponic'
  | 'balcony_roof';

export const ENVIRONMENTS: readonly Environment[] = [
  'open_air',
  'greenhouse',
  'tunnel',
  'indoor',
  'soilless',
  'hydroponic',
  'balcony_roof',
];

/**
 * Environnement effectif : propre, sinon celui de l'ancêtre le plus proche, sinon le premier du jardin.
 * `ancestorsFromRoot` est ordonné de la racine vers le parent direct.
 */
export function effectiveEnvironment(
  zone: { environment: Environment | null },
  ancestorsFromRoot: { environment: Environment | null }[],
  gardenEnvironments: readonly Environment[],
): Environment {
  if (zone.environment) return zone.environment;
  for (let i = ancestorsFromRoot.length - 1; i >= 0; i--) {
    const env = ancestorsFromRoot[i]?.environment;
    if (env) return env;
  }
  return gardenEnvironments[0] ?? 'open_air';
}

export type RectGeometry = { v: 1; kind: 'rect'; x: number; y: number; w: number; h: number };

export type SurfaceSource = 'plan' | 'manual' | 'dimensions' | 'unknown';

/** Surface effective en m² (RG-ZON-04) : géométrie > surface manuelle > longueur × largeur. */
export function effectiveSurface(zone: {
  geometry: RectGeometry | null;
  surfaceM2Manual: number | null;
  lengthCm: number | null;
  widthCm: number | null;
}): { m2: number | null; source: SurfaceSource } {
  if (zone.geometry) return { m2: round2((zone.geometry.w * zone.geometry.h) / 10_000), source: 'plan' };
  if (zone.surfaceM2Manual !== null) return { m2: zone.surfaceM2Manual, source: 'manual' };
  if (zone.lengthCm !== null && zone.widthCm !== null) {
    return { m2: round2((zone.lengthCm * zone.widthCm) / 10_000), source: 'dimensions' };
  }
  return { m2: null, source: 'unknown' };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Deux rectangles se chevauchent-ils (bords partagés autorisés) ? */
export function rectsOverlap(a: RectGeometry, b: RectGeometry): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export function rectContains(outer: RectGeometry, inner: RectGeometry): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  );
}

export type GeometryIssue = 'outside_parent' | 'overlaps_sibling';

/** Invariants de RG-ZON-05 pour une géométrie candidate. */
export function checkGeometry(
  candidate: RectGeometry,
  parent: RectGeometry | null,
  siblings: RectGeometry[],
): GeometryIssue | null {
  if (parent && !rectContains(parent, candidate)) return 'outside_parent';
  if (siblings.some((s) => rectsOverlap(s, candidate))) return 'overlaps_sibling';
  return null;
}

/** Construit l'arbre (racines → enfants) à partir d'une liste plate, triée par sort_order puis nom. */
export type TreeNode<T> = T & { children: TreeNode<T>[] };

export function buildTree<T extends { id: string; parentId: string | null; sortOrder: number; name: string }>(
  rows: T[],
): TreeNode<T>[] {
  const nodes = new Map<string, TreeNode<T>>();
  for (const r of rows) nodes.set(r.id, { ...r, children: [] });
  const roots: TreeNode<T>[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const sort = (list: TreeNode<T>[]) => {
    list.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'fr'));
    list.forEach((n) => sort(n.children));
  };
  sort(roots);
  return roots;
}
