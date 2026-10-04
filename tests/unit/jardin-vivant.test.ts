import { describe, expect, it } from 'vitest';
import { ambientFilter } from '@/features/scene/ambient.pure';
import { actionOf, replayedAction } from '@/features/scene/avatar-action.pure';
import { ACT_MS, avatarMoment, avatarRoute, ROUTE_POINTS, walkDir } from '@/features/scene/avatar-route.pure';
import { applyAll, type EditorScene } from '@/features/scene/plan.pure';
import { brushCells, paintCells, rectCells, resampleCells, type Cell } from '@/features/scene/terrain.pure';
import { existingTreeFrame, linearLayer, linearPiece, seasonal, surfaceLayer, variantAt, zonePieces } from '@/features/scene/tiles.pure';

/* Jardin vivant (SPEC §9.2, §9.5, §12.10) : terrain peint, saisons, actions des avatars. Fonctions pures, sans base. */

const all = () => true;
const cells = (kind: Cell['kind'], list: [number, number][]): Cell[] => list.map(([x, y]) => ({ x, y, kind }));

describe('terrain peint', () => {
  it('[PNT-02] une allée le long d\'une mare : deux couches, transitions à fond transparent seulement', () => {
    const terrain = [...cells('water', rectCells({ x: 0, y: 0 }, { x: 2, y: 2 })), ...cells('path', rectCells({ x: 3, y: 0 }, { x: 3, y: 4 }))];
    const water = surfaceLayer(terrain, 'water', 'summer', all);
    const path = surfaceLayer(terrain, 'path', 'summer', all);
    expect(water.length).toBeGreaterThan(0);
    expect(path.length).toBeGreaterThan(0);
    const frames = [...water, ...path].map((t) => t.frame);
    // Aucune transition opaque (qui contient l'herbe et recouvrirait la couche voisine).
    expect(frames.filter((f) => f.startsWith('transitions/') && !f.startsWith('transitions/alpha-'))).toEqual([]);
    expect(frames.some((f) => f.startsWith('transitions/alpha-eau-'))).toBe(true);
    expect(frames.some((f) => f.startsWith('transitions/alpha-chemin-'))).toBe(true);
    // Dual-grid : la tuile d'affichage entre la mare et l'allée lit ses 4 coins (masque 0b1010 côté allée).
    expect(path).toContainEqual({ x: 2.5, y: 0.5, frame: 'transitions/alpha-chemin-10.png' });
    // Cœur de la mare : tuile pleine.
    expect(water).toContainEqual({ x: 0.5, y: 0.5, frame: 'tuiles/eau-f1.png' });
  });

  it('[PNT-04] haies en T, en croix et en bout de ligne : la pièce suit les voisines', () => {
    expect(linearPiece({ n: false, s: true, e: true, o: true })).toBe('t-n');
    expect(linearPiece({ n: true, s: true, e: true, o: true })).toBe('croix');
    expect(linearPiece({ n: false, s: false, e: true, o: false })).toBe('bout-e');
    expect(linearPiece({ n: false, s: true, e: true, o: false })).toBe('coin-no');
    // Une haie horizontale avec une branche vers le haut au milieu : un T sans branche au sud.
    const hedge = cells('hedge', [[0, 2], [1, 2], [2, 2], [1, 1], [1, 0]]);
    const drawn = linearLayer(hedge, 'summer', all);
    expect(drawn).toContainEqual({ x: 1, y: 2, frame: 'structures/haie-t-s.png' });
    expect(drawn).toContainEqual({ x: 0, y: 2, frame: 'structures/haie-bout-e.png' });
    expect(drawn).toContainEqual({ x: 1, y: 0, frame: 'structures/haie-bout-s.png' });
    // Une clôture isolée est un poteau.
    expect(linearLayer(cells('fence', [[5, 5]]), 'summer', all)).toEqual([{ x: 5, y: 5, frame: 'structures/cloture-poteau.png' }]);
  });

  it('[PNT-06] changer d\'échelle rééchantillonne les cases sans déplacer le dessin', () => {
    const at50 = cells('path', [[2, 3], [3, 3]]);
    const at25 = resampleCells(at50, 50, 25);
    expect(at25).toHaveLength(8);
    expect(at25.every((c) => c.x >= 4 && c.x <= 7 && c.y >= 6 && c.y <= 7)).toBe(true);
    expect(resampleCells(at25, 25, 50).sort((a, b) => a.x - b.x)).toEqual(at50);
    // Même chose dans l'éditeur (application optimiste de `setScale`).
    const scene: EditorScene = { tileSizeCm: 50, zones: [], terrain: at50, decor: [] };
    expect(applyAll(scene, [{ op: 'setScale', tileSizeCm: 25 }], new Map()).terrain).toHaveLength(8);
  });

  it('peindre remplace le type d\'une case déjà peinte ; le pinceau de 3 × 3 couvre 9 cases', () => {
    const painted = paintCells(cells('path', [[0, 0]]), [[0, 0], [1, 0]], 'gravel_path');
    expect(painted).toEqual(cells('gravel_path', [[0, 0], [1, 0]]));
    expect(brushCells({ x: 0, y: 0 }, 3)).toHaveLength(9);
  });
});

describe('saisons du terrain', () => {
  it('[TER-02] à −34° de latitude, le 14 octobre est le printemps', () => {
    const at = new Date('2026-10-14T10:00:00Z');
    expect(ambientFilter(at, { lat: 50.47, lng: 4.87, timezone: 'Europe/Brussels' }).season).toBe('autumn');
    expect(ambientFilter(at, { lat: -34, lng: 18.4, timezone: 'Africa/Johannesburg' }).season).toBe('spring');
  });

  it('[TER-03] une variante saisonnière absente : la clé de base, sans erreur', () => {
    const has = (f: string) => f !== 'tuiles/gravier-hiver-2.png';
    expect(seasonal(has, 'tuiles/gravier', 'winter', '2')).toBe('tuiles/gravier-2.png');
    expect(seasonal(all, 'tuiles/gravier', 'winter', '2')).toBe('tuiles/gravier-hiver-2.png');
    expect(seasonal(() => false, 'tuiles/gravier', 'winter', '2')).toBeNull();
    // Un rendu sans aucune frame ne lève pas : il ne dessine rien.
    expect(surfaceLayer(cells('path', [[0, 0]]), 'path', 'winter', () => false)).toEqual([]);
  });

  it('[TER-04] la variante d\'une tuile ne dépend que de sa position', () => {
    const terrain = cells('gravel_path', rectCells({ x: 0, y: 0 }, { x: 9, y: 9 }));
    expect(surfaceLayer(terrain, 'gravel_path', 'summer', all)).toEqual(surfaceLayer(terrain, 'gravel_path', 'summer', all));
    const variants = new Set(rectCells({ x: 0, y: 0 }, { x: 9, y: 9 }).map(([x, y]) => variantAt(x, y, 3)));
    expect([...variants].sort()).toEqual([1, 2, 3]);
  });

  it('[TER-05] l\'hiver : planche en pièces d\'hiver avec la neige, pommier nu pour l\'arbre existant', () => {
    const pieces = zonePieces('bed', 3, 2, 'winter', all);
    expect(pieces?.find((p) => p.x === 0 && p.y === 0)).toEqual({ x: 0, y: 0, frame: 'structures/planche-no-hiver.png', snow: 'neige/planche-no.png' });
    expect(pieces?.find((p) => p.x === 1 && p.y === 1)?.frame).toBe('structures/planche-s-hiver.png');
    expect(zonePieces('bed', 3, 2, 'summer', all)?.every((p) => p.snow === null && !p.frame.includes('hiver'))).toBe(true);
    expect(existingTreeFrame('winter', all)).toBe('cultures/pommier-1-hiver.png');
    expect(existingTreeFrame('winter', () => false)).toBe('cultures/pommier-4-feuillage.png');
    // L'eau gèle.
    expect(surfaceLayer(cells('water', [[0, 0], [1, 0], [0, 1], [1, 1]]), 'water', 'winter', all)).toContainEqual({ x: 0.5, y: 0.5, frame: 'tuiles/eau-gelee-1.png' });
  });
});

describe('avatars en action', () => {
  it('[LIV-08] chaque événement donne l\'action visuelle du §9.5 ; au-delà de 24 h, aucune', () => {
    expect(actionOf({ type: 'journal.entry_created', journalKind: 'intervention', intervention: 'watering' })).toBe('arroser');
    expect(actionOf({ type: 'journal.entry_created', journalKind: 'intervention', intervention: 'weeding' })).toBe('becher');
    expect(actionOf({ type: 'journal.entry_created', journalKind: 'photo' })).toBe('photo');
    expect(actionOf({ type: 'journal.entry_created', journalKind: 'disease' })).toBe('observer');
    expect(actionOf({ type: 'culture.stage_recorded', stage: 'sowing' })).toBe('semer');
    expect(actionOf({ type: 'culture.stage_recorded', stage: 'planting' })).toBe('planter');
    expect(actionOf({ type: 'culture.created', method: 'direct_sowing' })).toBe('semer');
    expect(actionOf({ type: 'harvest.recorded' })).toBe('recolter');
    expect(actionOf({ type: 'ticket.completed', actionTag: null })).toBe('content');
    expect(actionOf({ type: 'ticket.completed', actionTag: 'watering' })).toBe('arroser');
    expect(actionOf({ type: 'zone.created' })).toBe('porter');
    const now = new Date('2026-10-14T10:00:00Z');
    const e = { type: 'harvest.recorded' };
    expect(replayedAction({ ...e, occurredAt: new Date(now.getTime() - 23 * 3_600_000) }, now)).toBe('recolter');
    expect(replayedAction({ ...e, occurredAt: new Date(now.getTime() - 24 * 3_600_000) }, now)).toBeNull();
  });
});

describe('avatars qui font le tour de leur zone', () => {
  const planche = { x: 100, y: 100, w: 200, h: 300 };
  const inside = (p: { x: number; y: number }) => p.x >= planche.x && p.x <= planche.x + planche.w && p.y >= planche.y && p.y <= planche.y + planche.h;

  it('[LIV-09] action à un point, marche vers un autre point de la même planche, en face de sa marche ; trajet déterministe', () => {
    const route = avatarRoute('lucie', planche, 50);
    expect(route).toHaveLength(ROUTE_POINTS);
    expect(route.every(inside)).toBe(true);
    expect(new Set(route.map((p) => `${p.x},${p.y}`)).size).toBeGreaterThan(1);
    // Même identifiant, même trajet ; un autre membre a le sien.
    expect(avatarRoute('lucie', planche, 50)).toEqual(route);
    expect(avatarRoute('bruno', planche, 50)).not.toEqual(route);
    // t = 0 : l'action au premier point, de face (image figée en animations réduites).
    expect(avatarMoment(route, 50, 0)).toEqual({ at: route[0], dir: 'bas', mode: 'act', elapsedMs: 0 });
    // Juste après l'action : il marche vers le deuxième point, face à son déplacement.
    const walking = avatarMoment(route, 50, ACT_MS + 10);
    expect(walking.mode).toBe('walk');
    expect(walking.dir).toBe(walkDir(route[0] ?? { x: 0, y: 0 }, route[1] ?? { x: 0, y: 0 }));
    // Tout au long de plusieurs tours, il reste sur la planche, et rejoue son action à chacun des points.
    const acts = new Set<string>();
    for (let t = 0; t < 120_000; t += 250) {
      const m = avatarMoment(route, 50, t);
      expect(inside(m.at)).toBe(true);
      if (m.mode === 'act') acts.add(`${m.at.x},${m.at.y}`);
    }
    expect(acts.size).toBe(new Set(route.map((p) => `${p.x},${p.y}`)).size);
  });

  it('une zone d\'une seule case : l\'avatar reste sur place et joue son action', () => {
    const route = avatarRoute('emma', { x: 0, y: 0, w: 50, h: 50 }, 50);
    expect(route.every((p) => p.x >= 0 && p.x <= 50 && p.y >= 0 && p.y <= 50)).toBe(true);
    expect(walkDir({ x: 0, y: 0 }, { x: -10, y: 2 })).toBe('gauche');
    expect(walkDir({ x: 0, y: 0 }, { x: 1, y: -10 })).toBe('haut');
  });
});
