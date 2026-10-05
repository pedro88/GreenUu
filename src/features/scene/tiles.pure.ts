import type { TerrainCellKind } from '@/lib/enums';
import { cellKey, type Cell } from './terrain.pure';

/*
 * Choix des frames du terrain et des structures (SPEC §9.2, lot 9), sans PixiJS : rendu dual-grid des cases peintes,
 * raccord des haies et des clôtures, pièces de planche et de carré, variantes saisonnières avec repli sur la clé de base.
 * `has` dit si une frame existe dans les atlas chargés ; rien ici ne lève quand une frame manque (§9.2).
 */

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export type Has = (frame: string) => boolean;
/** Tuile à dessiner, position en tuiles (coin haut-gauche ; décalée d'une demi-tuile pour le dual-grid). */
export type TileDraw = { x: number; y: number; frame: string };

/** Saison → mot des noms de frames ; l'été est la version de base, sans suffixe. */
export const SEASON_WORDS: Record<Season, string | null> = { spring: 'printemps', summer: null, autumn: 'automne', winter: 'hiver' };

/**
 * Frame saisonnière (TER-03) : `<base>-<saison>[-<suffixe>].png`, sinon `<base>[-<suffixe>].png`, sinon null. La saison
 * s'insère avant la variante ou le masque (`tuiles/terre-hiver-2`, `transitions/alpha-chemin-automne-07`).
 */
export function seasonal(has: Has, base: string, season: Season, suffix?: string): string | null {
  const tail = suffix ? `-${suffix}` : '';
  const word = SEASON_WORDS[season];
  const candidates = word ? [`${base}-${word}${tail}.png`, `${base}${tail}.png`] : [`${base}${tail}.png`];
  return candidates.find(has) ?? null;
}

/** Variante 1..n tirée de la position (TER-04) : pas d'aléatoire au rendu, donc pas de clignotement. */
export function variantAt(x: number, y: number, n: number): number {
  const h = (Math.imul(x, 73_856_093) ^ Math.imul(y, 19_349_663) ^ 0x5bd1e995) >>> 0;
  return (h % n) + 1;
}

type Surface = { tile: string; variants: number; alpha: string | null };
/** Surfaces peintes, dans l'ordre fixe des couches (eau en dessous, dalles au-dessus). */
export const SURFACES: Partial<Record<TerrainCellKind, Surface>> = {
  water: { tile: 'tuiles/eau-f1', variants: 0, alpha: 'transitions/alpha-eau' },
  bare_soil: { tile: 'tuiles/terre-nue', variants: 3, alpha: 'transitions/alpha-terre-nue' },
  mulch: { tile: 'tuiles/paillage-paille', variants: 3, alpha: 'transitions/alpha-paillage' },
  path: { tile: 'tuiles/chemin', variants: 3, alpha: 'transitions/alpha-chemin' },
  gravel_path: { tile: 'tuiles/gravier', variants: 3, alpha: 'transitions/alpha-gravier' },
  stepping_stones: { tile: 'tuiles/dalles', variants: 2, alpha: null },
};
export const SURFACE_ORDER: readonly TerrainCellKind[] = ['water', 'bare_soil', 'mulch', 'path', 'gravel_path', 'stepping_stones'];
export const LINEAR_KINDS: readonly TerrainCellKind[] = ['hedge', 'fence'];

/** Tuile pleine d'une surface, variante et saison comprises (l'eau gèle l'hiver). */
function fullTile(has: Has, s: Surface, season: Season, x: number, y: number): string | null {
  if (s.tile === 'tuiles/eau-f1') return (season === 'winter' && has('tuiles/eau-gelee-1.png') ? 'tuiles/eau-gelee-1.png' : null) ?? (has('tuiles/eau-f1.png') ? 'tuiles/eau-f1.png' : null);
  return seasonal(has, s.tile, season, s.variants ? String(variantAt(x, y, s.variants)) : undefined);
}

/**
 * Couche dual-grid d'une surface (§9.2) : la grille d'affichage est décalée d'une demi-tuile, chaque tuile d'affichage
 * lit ses 4 coins (haut-gauche = 1, haut-droit = 2, bas-gauche = 4, bas-droit = 8). Masque 15 : tuile pleine ; masque
 * partiel : transition à fond transparent, pour ne jamais recouvrir une autre couche d'herbe (PNT-02).
 */
export function surfaceLayer(cells: readonly Cell[], kind: TerrainCellKind, season: Season, has: Has): TileDraw[] {
  const s = SURFACES[kind];
  const mine = cells.filter((c) => c.kind === kind);
  if (!s || !mine.length) return [];
  if (!s.alpha) {
    // Bord net (dalles) : une tuile par case.
    return mine.flatMap((c) => {
      const frame = fullTile(has, s, season, c.x, c.y);
      return frame ? [{ x: c.x, y: c.y, frame }] : [];
    });
  }
  const on = new Set(mine.map((c) => cellKey(c.x, c.y)));
  const at = (x: number, y: number) => on.has(cellKey(x, y));
  const corners = new Set<string>();
  for (const c of mine) for (const dx of [0, 1]) for (const dy of [0, 1]) corners.add(cellKey(c.x + dx, c.y + dy));
  const out: TileDraw[] = [];
  for (const k of corners) {
    const [i, j] = k.split(',').map(Number) as [number, number]; // as: clé produite par cellKey
    const mask = (at(i - 1, j - 1) ? 1 : 0) | (at(i, j - 1) ? 2 : 0) | (at(i - 1, j) ? 4 : 0) | (at(i, j) ? 8 : 0);
    if (!mask) continue;
    const frame = mask === 15 ? fullTile(has, s, season, i, j) ?? seasonal(has, s.alpha, season, '15') : seasonal(has, s.alpha, season, String(mask).padStart(2, '0'));
    if (frame) out.push({ x: i - 0.5, y: j - 0.5, frame });
  }
  return out.sort((a, b) => a.y - b.y || a.x - b.x);
}

/**
 * Pièce de haie ou de clôture selon les voisines du même type. Clé : branches dans l'ordre n (haut), s (bas), e
 * (droite), o (gauche) ; noms des pièces de SPRITES.md (`coin-no` relie e et s, `t-n` n'a pas de branche au nord…).
 */
const PIECES: Record<string, string> = {
  '': 'seule', eo: 'h', ns: 'v', se: 'coin-no', so: 'coin-ne', ne: 'coin-so', no: 'coin-se',
  seo: 't-n', neo: 't-s', nso: 't-e', nse: 't-o', nseo: 'croix', n: 'bout-n', s: 'bout-s', e: 'bout-e', o: 'bout-o',
};

export function linearPiece(arms: { n: boolean; s: boolean; e: boolean; o: boolean }): string {
  return PIECES[`${arms.n ? 'n' : ''}${arms.s ? 's' : ''}${arms.e ? 'e' : ''}${arms.o ? 'o' : ''}`] ?? 'seule';
}

/** Haies et clôtures raccordées (PNT-04) ; la clôture isolée est un poteau, la haie a ses variantes saisonnières. */
export function linearLayer(cells: readonly Cell[], season: Season, has: Has): TileDraw[] {
  const out: TileDraw[] = [];
  for (const kind of LINEAR_KINDS) {
    const mine = cells.filter((c) => c.kind === kind);
    const on = new Set(mine.map((c) => cellKey(c.x, c.y)));
    for (const c of mine) {
      let piece = linearPiece({ n: on.has(cellKey(c.x, c.y - 1)), s: on.has(cellKey(c.x, c.y + 1)), e: on.has(cellKey(c.x + 1, c.y)), o: on.has(cellKey(c.x - 1, c.y)) });
      if (kind === 'fence' && piece === 'seule') piece = 'poteau';
      const base = `structures/${kind === 'hedge' ? 'haie' : 'cloture'}-${piece}`;
      const frame = kind === 'hedge' ? seasonal(has, base, season) : has(`${base}.png`) ? `${base}.png` : null;
      if (frame) out.push({ x: c.x, y: c.y, frame });
    }
  }
  return out.sort((a, b) => a.y - b.y || a.x - b.x);
}

/** Pièces d'une planche (`planche-<pos>`) ou d'un carré (`carre-<pos>`), avec la neige sur la planche l'hiver (TER-05). */
export function zonePieces(typeCode: string, cols: number, rows: number, season: Season, has: Has): { x: number; y: number; frame: string; snow: string | null }[] | null {
  const kind = typeCode === 'bed' ? 'planche' : typeCode === 'square_bed' ? 'carre' : null;
  if (!kind) return null;
  const pos = (x: number, y: number): string | null => {
    if (cols === 1 && rows === 1) return kind === 'carre' ? '1x1' : null;
    if (rows === 1) return kind === 'carre' ? `1xn-${x === 0 ? 'debut' : x === cols - 1 ? 'fin' : 'milieu'}` : null;
    if (cols === 1) return kind === 'carre' ? `nx1-${y === 0 ? 'haut' : y === rows - 1 ? 'bas' : 'milieu'}` : null;
    const v = y === 0 ? 'n' : y === rows - 1 ? 's' : '';
    const h = x === 0 ? 'o' : x === cols - 1 ? 'e' : '';
    return v + h || 'centre';
  };
  const out: { x: number; y: number; frame: string; snow: string | null }[] = [];
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const p = pos(x, y);
      const frame = p ? seasonal(has, `structures/${kind}-${p}`, season) : null;
      if (!frame) return null;
      const snow = season === 'winter' && kind === 'planche' && p !== 'centre' && has(`neige/planche-${p}.png`) ? `neige/planche-${p}.png` : null;
      out.push({ x, y, frame, snow });
    }
  }
  return out;
}

/**
 * Serre vue de face (SPRITES.md, structures modulaires) : une pièce par colonne de tuiles, `serre-debut`, des pièces
 * `serre-milieu*`, puis `serre-fin` ; la porte au milieu, une aération une pièce sur deux. Une serre d'une seule colonne
 * est sa porte. L'hiver, la neige du toit (`neige/serre-toit*`). Null si une pièce manque à l'atlas.
 */
export function greenhousePieces(cols: number, season: Season, has: Has): { frame: string; snow: string | null }[] | null {
  const door = Math.floor((cols - 1) / 2);
  const names = cols === 1 ? ['milieu-porte'] : Array.from({ length: cols }, (_, i) => {
    if (i === 0) return 'debut';
    if (i === cols - 1) return 'fin';
    if (i === door) return 'milieu-porte';
    return Math.abs(i - door) % 2 === 1 ? 'milieu' : 'milieu-aeration';
  });
  const out: { frame: string; snow: string | null }[] = [];
  for (const n of names) {
    const frame = `structures/serre-${n}.png`;
    if (!has(frame)) return null;
    const roof = n === 'debut' ? 'neige/serre-toit-debut.png' : n === 'fin' ? 'neige/serre-toit-fin.png' : 'neige/serre-toit.png';
    out.push({ frame, snow: season === 'winter' && has(roof) ? roof : null });
  }
  return out;
}

/**
 * Découpe verticale des pièces de serre, en fractions de leur hauteur : le toit, une bande vitrée répétée autant que
 * la profondeur de la serre l'exige, puis le mur avec la porte et le soubassement (lignes 38 et 56 sur 128).
 */
export const GREENHOUSE_SLICES = { top: 38 / 128, bottom: 56 / 128 } as const;

/** Arbre existant : les étapes du pommier selon la saison (TER-05), repli sur le feuillage d'été. */
export function existingTreeFrame(season: Season, has: Has): string {
  const byseason: Record<Season, string> = { winter: 'cultures/pommier-1-hiver.png', spring: 'cultures/pommier-3-floraison.png', summer: 'cultures/pommier-4-feuillage.png', autumn: 'cultures/pommier-6-automne.png' };
  return has(byseason[season]) ? byseason[season] : 'cultures/pommier-4-feuillage.png';
}
