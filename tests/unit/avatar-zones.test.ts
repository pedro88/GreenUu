import { describe, expect, it } from 'vitest';
import { avatarPlan, CHAT_PICTOS, chatPairs, chatPicto, planMoment } from '@/features/scene/avatar-route.pure';
import { findPath, walkGrid, type Rect } from '@/features/scene/path.pure';

/* Avatars qui vont d'une zone à l'autre (SPEC §9.5, §12.11). Tuiles de 50 cm. */

const T = 50;
const inside = (r: Rect) => (p: { x: number; y: number }) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
const tileOf = (p: { x: number; y: number }) => ({ x: Math.floor(p.x / T), y: Math.floor(p.y / T) });

describe('chemins entre les zones', () => {
  it('[LIV-03] le chemin contourne une planche et emprunte une allée peinte', () => {
    // Planche au milieu (tuiles 4 à 5, 0 à 7) ; départ à gauche, arrivée à droite.
    const planche = { x: 200, y: 0, w: 100, h: 400 };
    const allee = Array.from({ length: 12 }, (_, x) => ({ x, y: 9, kind: 'path' as const }));
    const grid = walkGrid({ bounds: { w: 600, h: 600 }, tileCm: T, zones: [{ rect: planche, typeCode: 'bed' }], cells: allee });
    const path = findPath(grid, { x: 25, y: 25 }, { x: 525, y: 25 });
    // Échantillonne le trajet : aucune tuile ne tombe dans la planche.
    for (const [i, p] of path.slice(1).entries()) {
      const a = path[i] ?? p;
      for (let k = 0; k <= 20; k += 1) {
        const q = { x: a.x + ((p.x - a.x) * k) / 20, y: a.y + ((p.y - a.y) * k) / 20 };
        expect(inside(planche)(q) && q.x > planche.x && q.x < planche.x + planche.w && q.y < planche.y + planche.h).toBe(false);
      }
    }
    // Avec une allée qui longe le bas de la planche (ligne 8), le chemin l'emprunte.
    const allee8 = Array.from({ length: 12 }, (_, x) => ({ x, y: 8, kind: 'path' as const }));
    const viaPath = findPath(walkGrid({ bounds: { w: 600, h: 600 }, tileCm: T, zones: [{ rect: planche, typeCode: 'bed' }], cells: allee8 }), { x: 25, y: 25 }, { x: 525, y: 25 });
    expect(viaPath.some((p) => tileOf(p).y === 8)).toBe(true);
    // Une haie ferme le passage : sans autre issue, ligne droite (l'avatar ne reste jamais bloqué).
    const wall = Array.from({ length: 12 }, (_, y) => ({ x: 3, y, kind: 'hedge' as const }));
    expect(findPath(walkGrid({ bounds: { w: 600, h: 600 }, tileCm: T, zones: [], cells: wall }), { x: 25, y: 25 }, { x: 525, y: 25 })).toEqual([{ x: 25, y: 25 }, { x: 525, y: 25 }]);
  });

  it('[LIV-10] deux zones dans les 24 h : tour de la première, chemin vers la seconde, tour de la seconde, retour', () => {
    const a = { x: 0, y: 0, w: 150, h: 300 };
    const b = { x: 400, y: 0, w: 150, h: 300 };
    const grid = walkGrid({ bounds: { w: 600, h: 400 }, tileCm: T, zones: [{ rect: a, typeCode: 'bed' }, { rect: b, typeCode: 'bed' }], cells: [], open: [a, b] });
    const plan = avatarPlan('lucie', [a, b], T, (from, to) => findPath(grid, from, to));
    const acts = plan.filter((s) => s.kind === 'act');
    expect(acts).toHaveLength(6);
    expect(acts.slice(0, 3).every((s) => s.kind === 'act' && inside(a)(s.at))).toBe(true);
    expect(acts.slice(3).every((s) => s.kind === 'act' && inside(b)(s.at))).toBe(true);
    // Le tour boucle : la dernière marche ramène à la première zone.
    const last = plan.at(-1);
    expect(last?.kind === 'walk' && inside(a)(last.path.at(-1) ?? { x: -1, y: -1 })).toBe(true);
    // Au fil du temps, l'avatar agit dans les deux zones, et seulement là.
    const seen = new Set<string>();
    for (let t = 0; t < 200_000; t += 200) {
      const m = planMoment(plan, T, t);
      if (m.mode === 'act') seen.add(inside(a)(m.at) ? 'a' : inside(b)(m.at) ? 'b' : 'ailleurs');
    }
    expect([...seen].sort()).toEqual(['a', 'b']);
    expect(planMoment(plan, T, 0)).toMatchObject({ mode: 'act', dir: 'bas' });
  });
});

describe('rencontres', () => {
  it('[LIV-02] deux avatars à moins de 2 tuiles se rencontrent ; la bulle est un pictogramme', () => {
    const pairs = chatPairs([{ id: 'b', at: { x: 0, y: 0 } }, { id: 'a', at: { x: 60, y: 0 } }, { id: 'c', at: { x: 400, y: 0 } }], T);
    expect(pairs).toEqual([['a', 'b']]);
    // Un avatar ne parle qu'à un autre à la fois.
    expect(chatPairs([{ id: 'a', at: { x: 0, y: 0 } }, { id: 'b', at: { x: 10, y: 0 } }, { id: 'c', at: { x: 20, y: 0 } }], T)).toHaveLength(1);
    const picto = chatPicto('a', 'b', 0);
    expect(CHAT_PICTOS).toContain(picto);
    expect(chatPicto('a', 'b', 0)).toBe(picto);
  });
});
