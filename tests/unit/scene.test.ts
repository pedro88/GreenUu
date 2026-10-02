import { describe, expect, it, vi } from 'vitest';
import { ambientFilter } from '@/features/scene/ambient.pure';
import { geometryInTiles, tilesToGeometry, areaM2, deduceParent, layoutInRect } from '@/features/scene/grid.pure';
import { visualPhase, orderStates, type PhaseInput } from '@/features/scene/phase.pure';
import { applyAll, replay, type EditorScene, type ZoneTypeInfo } from '@/features/scene/plan.pure';
import { planCommandSchema, type PlanCommand } from '@/features/scene/plan.schema';
import { RenderLoop, type FrameScheduler } from '@/game/engine/loop';
import { buildPhaseIndex, resolvePlantFrame, type Atlas } from '@/game/manifest';
import { createHistoryStore } from '@/game/stores';

const culture = (over: Partial<PhaseInput> = {}): PhaseInput => ({ method: 'direct_sowing', status: 'active', perennial: false, visualModel: 'fruit', stages: [], ...over });

describe('phase visuelle (§9.3)', () => {
  it('[MAP-05] semis réel le 01/04, levée prévue le 10/04, plantation prévue le 15/05 : au 20/04, sprout à 0,29', () => {
    const r = visualPhase(culture({ stages: [
      { stage: 'sowing', plannedOn: '2026-04-01', actualOn: '2026-04-01' },
      { stage: 'emergence', plannedOn: '2026-04-10', actualOn: null },
      { stage: 'planting', plannedOn: '2026-05-15', actualOn: null },
    ] }), '2026-04-20');
    expect(r.phase).toBe('sprout');
    expect(r.progress).toBeCloseTo(10 / 35, 2);
  });

  it('[MAP-06] levée prévue dépassée de 8 jours sans date réelle : une seule phase de bascule et needsConfirmation', () => {
    const stages = [
      { stage: 'sowing' as const, plannedOn: '2026-04-01', actualOn: '2026-04-01' },
      { stage: 'emergence' as const, plannedOn: '2026-04-10', actualOn: null },
      // La floraison prévue est aussi dépassée : on ne saute pourtant qu'une phase.
      { stage: 'flowering' as const, plannedOn: '2026-04-15', actualOn: null },
    ];
    const r = visualPhase(culture({ stages }), '2026-04-18');
    expect(r).toMatchObject({ phase: 'sprout', needsConfirmation: true });
    expect(visualPhase(culture({ stages }), '2026-04-17').needsConfirmation).toBe(false);
  });

  it('une culture en plants achetés commence en growing ; une terminée reste 14 jours visible', () => {
    expect(visualPhase(culture({ method: 'bought_plants' }), '2026-05-01').phase).toBe('growing');
    const done = culture({ status: 'finished', endedOn: '2026-05-01' });
    expect(visualPhase(done, '2026-05-15')).toMatchObject({ phase: 'finished', visible: true });
    expect(visualPhase(done, '2026-05-16').visible).toBe(false);
  });

  it('une vivace en hiver, sans étape en cours, est dormant (selon l\'hémisphère)', () => {
    const fraisier = culture({ perennial: true, visualModel: 'perennial', stages: [{ stage: 'planting', plannedOn: null, actualOn: '2025-04-01' }] });
    expect(visualPhase(fraisier, '2026-01-15').phase).toBe('dormant');
    expect(visualPhase(fraisier, '2026-01-15', { south: true }).phase).toBe('growing');
  });

  it('les états suivent l\'ordre de priorité du tableau §9.4', () => {
    expect(orderStates(['assigned_to_me', 'thirsty', 'overdue_ticket'])).toEqual(['overdue_ticket', 'thirsty', 'assigned_to_me']);
  });
});

describe('résolution des frames (§9.2)', () => {
  const frame = { frame: { x: 0, y: 0, w: 32, h: 32 } };
  const atlas: Atlas = {
    frames: { 'cultures/tomate-2-levee.png': frame, 'cultures/tomate-4-floraison.png': frame, 'familles/solanacees-3-croissance.png': frame, 'familles/inconnue-2-levee.png': frame },
    meta: { image: 'atlas.png', size: { w: 64, h: 64 } },
  };
  const index = buildPhaseIndex(atlas);

  it('[MAP-07] une clé de variété absente : espèce, puis famille, puis unknown_plant, sans exception', () => {
    const missing = vi.fn();
    expect(resolvePlantFrame(index, ['tomate-coeur-de-boeuf', 'tomate', 'family:solanaceae'], 'flowering', missing)).toMatchObject({ key: 'tomate', frame: 'cultures/tomate-4-floraison.png' });
    expect(missing).toHaveBeenCalledWith('tomate-coeur-de-boeuf');
    expect(resolvePlantFrame(index, ['variete-x', 'espece-x', 'family:solanaceae'], 'growing')).toMatchObject({ key: 'family:solanaceae', frame: 'familles/solanacees-3-croissance.png' });
    expect(resolvePlantFrame(index, ['variete-x', 'espece-x', 'family:inconnue-x'], 'sprout')).toMatchObject({ key: 'unknown_plant', frame: 'familles/inconnue-2-levee.png' });
    // Sans atlas du tout : pas de frame, le moteur dessine un asset de substitution.
    expect(resolvePlantFrame(buildPhaseIndex(null), ['tomate'], 'seed')).toEqual({ frame: null, key: 'unknown_plant', fallbackDepth: 1 });
  });
});

describe('filtre ambiant (§9.1)', () => {
  const brussels = { lat: 50.85, lng: 4.35, timezone: 'Europe/Brussels' };
  it('[MAP-11] à 50° N en juin : nuit à 23 h, jour à 13 h (heure du jardin)', () => {
    expect(ambientFilter(new Date('2026-06-21T21:00:00Z'), brussels).period).toBe('night');
    expect(ambientFilter(new Date('2026-06-21T11:00:00Z'), brussels)).toMatchObject({ period: 'day', season: 'summer', alpha: 0 });
    // Soir d'été à 21 h 45 : soleil juste sous l'horizon, encore le crépuscule.
    expect(ambientFilter(new Date('2026-06-21T19:45:00Z'), brussels).period).toBe('dusk');
  });
});

describe('grille du plan (§9.6, §9.7)', () => {
  it('[PLN-07] passer de 50 à 25 cm par tuile ne change pas les dimensions réelles ; la zone occupe deux fois plus de tuiles par côté', () => {
    const g = tilesToGeometry({ x: 2, y: 2 }, { x: 5, y: 4 }, 50);
    expect(g).toEqual({ v: 1, kind: 'rect', x: 100, y: 100, w: 200, h: 150 });
    expect(areaM2(g)).toBe(3);
    expect(geometryInTiles(g, 50)).toEqual({ x: 2, y: 2, w: 4, h: 3 });
    expect(geometryInTiles(g, 25)).toEqual({ x: 4, y: 4, w: 8, h: 6 });
  });

  it('le parent déduit est la zone la plus profonde qui contient le rectangle ; les cultures sont réparties dans leur zone', () => {
    const potager = { id: 'p', depth: 0, geometry: { v: 1 as const, kind: 'rect' as const, x: 0, y: 0, w: 1000, h: 600 } };
    const planche = { id: 'b', depth: 1, geometry: { v: 1 as const, kind: 'rect' as const, x: 500, y: 50, w: 100, h: 500 } };
    expect(deduceParent(tilesToGeometry({ x: 2, y: 2 }, { x: 5, y: 4 }, 50), [potager, planche])?.id).toBe('p');
    expect(deduceParent({ v: 1, kind: 'rect', x: 500, y: 100, w: 50, h: 50 }, [potager, planche])?.id).toBe('b');
    const pts = layoutInRect(planche.geometry, 3);
    expect(pts).toHaveLength(3);
    expect(pts.every((p) => p.x > 500 && p.x < 600 && p.y > 50 && p.y < 550)).toBe(true);
  });
});

const BED = '00000000-0000-4000-8000-0000000000be';
const types = new Map<string, ZoneTypeInfo>([[BED, { id: BED, code: 'bed', label: 'Planche', canHostCultures: true, hasInteriorDefault: false }]]);
const base: EditorScene = {
  tileSizeCm: 50, terrain: [],
  zones: [{ id: '00000000-0000-4000-8000-000000000001', name: 'Potager', typeCode: 'plot', parentId: null, depth: 0, geometry: { v: 1, kind: 'rect', x: 0, y: 0, w: 1000, h: 600 }, hasInterior: false, canHostCultures: true, label: 'Potager' }],
};
const create = (id: string, x: number): PlanCommand => planCommandSchema.parse({ op: 'createZone', clientId: `tmp:${id}`, name: id, zoneTypeId: BED, parentId: base.zones[0]?.id, geometry: { v: 1, kind: 'rect', x, y: 100, w: 200, h: 150 } });

describe('éditeur : annuler / rétablir', () => {
  it('[PLN-05] dessiner, annuler puis rétablir : le store reflète chaque étape et chaque changement redemande un rendu', () => {
    const history = createHistoryStore(base, 7, types);
    const renders = vi.fn();
    history.subscribe(renders);
    history.getState().push(create('a', 100));
    expect(history.getState().current.zones.map((z) => z.name)).toEqual(['Potager', 'a']);
    history.getState().undo();
    expect(history.getState().current.zones.map((z) => z.name)).toEqual(['Potager']);
    history.getState().redo();
    expect(history.getState().current.zones.map((z) => z.name)).toEqual(['Potager', 'a']);
    expect(renders).toHaveBeenCalledTimes(3);
    // Un nouveau geste après une annulation efface la pile « rétablir ».
    history.getState().undo();
    history.getState().push(create('b', 400));
    history.getState().redo();
    expect(history.getState().current.zones.map((z) => z.name)).toEqual(['Potager', 'b']);
  });

  it('le rejeu après conflit écarte les commandes devenues invalides et les signale', () => {
    const theirs = applyAll(base, [create('autre', 100)], types);
    const r = replay(theirs, [create('a', 150), create('c', 600)], types);
    expect(r.kept.map((c) => (c.op === 'createZone' ? c.name : ''))).toEqual(['c']);
    expect(r.conflicts).toEqual([expect.objectContaining({ issue: 'overlaps_sibling' })]);
  });
});

/** Ordonnanceur manuel : les frames ne passent que quand le test fait avancer le temps. */
function fakeScheduler() {
  let now = 0;
  let id = 0;
  const queue = new Map<number, (t: number) => void>();
  const s: FrameScheduler & { advance: (ms: number) => void } = {
    now: () => now,
    request: (cb) => { id += 1; queue.set(id, cb); return id; },
    cancel: (i) => { queue.delete(i); },
    advance: (ms) => {
      const end = now + ms;
      while (now < end) {
        now = Math.min(end, now + 16);
        const due = [...queue.entries()];
        queue.clear();
        for (const [, cb] of due) cb(now);
      }
    },
  };
  return s;
}

describe('moteur de rendu à la demande (§9.1)', () => {
  it('[MAP-08] sans interaction ni animation active, 5 secondes ne déclenchent aucun rendu', () => {
    const scheduler = fakeScheduler();
    const renderer = { render: vi.fn() };
    const loop = new RenderLoop(renderer, scheduler, { reducedMotion: true });
    loop.requestRender();
    loop.requestRender();
    scheduler.advance(100);
    expect(loop.renders).toBe(1);
    scheduler.advance(5_000);
    expect(loop.renders).toBe(1);
    expect(loop.running).toBe(false);
  });

  it('les animations ambiantes tournent à 30 i/s au plus et s\'arrêtent après 20 s sans interaction', () => {
    const scheduler = fakeScheduler();
    const loop = new RenderLoop({ render: vi.fn() }, scheduler, { reducedMotion: false });
    loop.noteInteraction();
    expect(loop.running).toBe(true);
    scheduler.advance(1_000);
    expect(loop.renders).toBeGreaterThan(20);
    expect(loop.renders).toBeLessThanOrEqual(31);
    scheduler.advance(20_000);
    expect(loop.running).toBe(false);
    const after = loop.renders;
    scheduler.advance(5_000);
    expect(loop.renders).toBe(after);
  });
});
