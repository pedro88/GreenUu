import { describe, expect, it } from 'vitest';
import { AVATAR_ITEMS, PALETTES } from '@/features/avatar/catalog';
import { canonicalJson, checkConfig, codeCatalogView, defaultAvatar, mulberry32, normalizeConfig, randomAvatar } from '@/features/avatar/config.pure';
import { hexToRgb, recolorPixels, RESERVED_GREYS } from '@/features/avatar/recolor.pure';
import { frameCandidates, gabaritsSchema, headOffset } from '@/features/avatar/frames.pure';
import { startPreview } from '@/features/avatar/ui/preview';
import { isUnlocked, NO_PROGRESS } from '@/features/progression/unlock.pure';
import { AVATAR_LAYERS, REQUIRED_AVATAR_LAYERS } from '@/lib/enums';

const view = codeCatalogView(NO_PROGRESS);
const base = () => normalizeConfig(defaultAvatar('00000000-0000-7000-8000-000000000001'));

describe('configuration d\'avatar (§10.3)', () => {
  it('[AVT-04] un calque obligatoire (body) mis à null est refusé en VALIDATION', () => {
    const c = base();
    c.layers.body = { item: null, palettes: [] };
    const r = checkConfig(c, view);
    expect(r).toMatchObject({ ok: false, code: 'VALIDATION' });
    expect(r.ok ? {} : 'fields' in r ? r.fields : {}).toHaveProperty(['layers.body.item']);
    // Les autres calques obligatoires aussi ; un calque facultatif accepte « aucun ».
    for (const l of REQUIRED_AVATAR_LAYERS) expect(checkConfig({ ...c, layers: { ...base().layers, [l]: { item: null, palettes: [] } } }, view).ok).toBe(false);
    expect(checkConfig({ ...base(), layers: { ...base().layers, headwear: { item: null, palettes: [] } } }, view).ok).toBe(true);
  });

  it('un élément sur le mauvais calque, ou une palette d\'un autre type d\'emplacement, est refusé', () => {
    const c = base();
    expect(checkConfig({ ...c, layers: { ...c.layers, top: { item: 'hair_short', palettes: ['hair_black'] } } }, view)).toMatchObject({ code: 'VALIDATION' });
    expect(checkConfig({ ...c, layers: { ...c.layers, body: { item: 'body', palettes: ['leaf'] } } }, view)).toMatchObject({ code: 'VALIDATION' });
  });

  it('un élément verrouillé donne LOCKED_ITEM, sauf s\'il était déjà équipé', () => {
    // Le catalogue actuel est entièrement disponible : on simule un contenu exclusif.
    const exclusive = new Map(view.items);
    const straw = view.items.get('hat_straw');
    if (straw) exclusive.set('hat_straw', { ...straw, unlocked: false });
    const lockedView = { ...view, items: exclusive };
    const c = base();
    const forged = { ...c, layers: { ...c.layers, headwear: { item: 'hat_straw', palettes: ['straw'] } } };
    expect(checkConfig(forged, lockedView)).toEqual({ ok: false, code: 'LOCKED_ITEM', items: ['hat_straw'] });
    expect(checkConfig(forged, lockedView, normalizeConfig(forged)).ok).toBe(true);
  });

  it('tout le catalogue actuel est disponible dès le départ', () => {
    expect(AVATAR_ITEMS.filter((i) => i.unlock.kind !== 'none').map((i) => i.code)).toEqual([]);
  });

  it('un élément dont les sprites ne sont pas livrés est refusé (itemUnavailable)', () => {
    const c = base();
    const r = checkConfig({ ...c, layers: { ...c.layers, face_eyes: { item: 'eyes_almond', palettes: ['eye_green'] } } }, codeCatalogView(NO_PROGRESS, new Set(['ombre-base', 'corps-base', 'yeux-base'])));
    expect(r).toMatchObject({ ok: false, code: 'VALIDATION', fields: { 'layers.face_eyes.item': ['itemUnavailable'] } });
  });

  it('un corps sans tête exige une forme de visage ; un corps qui comprend la tête n\'en accepte pas', () => {
    const all = new Set(AVATAR_ITEMS.map((i) => i.spriteKey));
    const v = codeCatalogView(NO_PROGRESS, all);
    const c = base();
    const headless = { ...c, layers: { ...c.layers, body: { item: 'body_round_tall', palettes: ['skin_07'] }, head: { item: null, palettes: [] } } };
    expect(checkConfig(headless, v)).toMatchObject({ code: 'VALIDATION', fields: { 'layers.head.item': ['required'] } });
    expect(checkConfig({ ...headless, layers: { ...headless.layers, head: { item: 'head_heart', palettes: [] } } }, v).ok).toBe(true);
    expect(checkConfig({ ...c, layers: { ...c.layers, head: { item: 'head_oval', palettes: [] } } }, v)).toMatchObject({ fields: { 'layers.head.item': ['headIncludedInBody'] } });
  });

  it('le JSON canonique ne dépend pas de l\'ordre des clés', () => {
    expect(canonicalJson({ b: 1, a: { d: [1, { y: 2, x: 1 }], c: null } })).toBe('{"a":{"c":null,"d":[1,{"x":1,"y":2}]},"b":1}');
  });
});

describe('recoloration par palette (§10.2)', () => {
  it('[AVT-05] chaque gris réservé prend la couleur de même rang ; transparents et contour restent intacts', () => {
    const ramp = ['#ff0000', '#00ff00', '#0000ff', '#ffff00'];
    const greys = RESERVED_GREYS[0] ?? [];
    const outline = [42, 28, 30, 255];
    const px = new Uint8ClampedArray([...greys.flatMap((g) => [g, g, g, 255]), 0, 0, 0, 0, 224, 224, 224, 0, ...outline, 100, 100, 100, 255]);
    recolorPixels(px, [ramp]);
    greys.forEach((_, i) => expect([...px.slice(i * 4, i * 4 + 4)]).toEqual([...hexToRgb(ramp[i] ?? ''), 255]));
    expect([...px.slice(16, 20)]).toEqual([0, 0, 0, 0]);
    // Un pixel transparent n'est jamais recoloré, même s'il porte un gris réservé.
    expect([...px.slice(20, 24)]).toEqual([224, 224, 224, 0]);
    expect([...px.slice(24, 28)]).toEqual(outline);
    // Un gris non réservé n'est pas touché.
    expect([...px.slice(28, 32)]).toEqual([100, 100, 100, 255]);
  });

  it('le second emplacement a sa propre plage de gris', () => {
    const g = RESERVED_GREYS[1]?.[0] ?? 0;
    const px = new Uint8ClampedArray([g, g, g, 255, 224, 224, 224, 255]);
    recolorPixels(px, [null, ['#123456', '#000000', '#000000', '#000000']]);
    expect([...px]).toEqual([0x12, 0x34, 0x56, 255, 224, 224, 224, 255]);
  });
});

describe('tirages (§10.3, §10.4)', () => {
  it('[AVT-06] « Aléatoire » pressé 50 fois ne choisit jamais un élément verrouillé', () => {
    const unlocked = (code: string) => AVATAR_ITEMS.find((i) => i.code === code)?.unlock.kind === 'none';
    const rnd = mulberry32(7);
    const seen = new Set<string>();
    for (let k = 0; k < 50; k += 1) {
      const c = randomAvatar(unlocked, rnd);
      for (const l of AVATAR_LAYERS) {
        const item = c.layers[l]?.item;
        if (!item) continue;
        seen.add(item);
        expect(unlocked(item), item).toBe(true);
      }
      expect(checkConfig(c, view).ok).toBe(true);
    }
    // Le tirage varie vraiment (plusieurs coiffures).
    expect([...seen].filter((i) => i.startsWith('hair_')).length).toBeGreaterThan(1);
  });

  it('[AVT-09] l\'avatar par défaut est déterministe, valide et composé d\'éléments débloqués', () => {
    const ids = ['0199a0b0-0000-7000-8000-00000000000a', '0199a0b0-0000-7000-8000-00000000000b', '0199a0b0-0000-7000-8000-00000000000c'];
    for (const id of ids) {
      const a = defaultAvatar(id);
      expect(defaultAvatar(id)).toEqual(a);
      const r = checkConfig(a, view);
      expect(r.ok).toBe(true);
      for (const l of AVATAR_LAYERS) {
        const item = AVATAR_ITEMS.find((i) => i.code === a.layers[l]?.item);
        if (item) expect(isUnlocked(item.unlock, NO_PROGRESS)).toBe(true);
      }
    }
    expect(new Set(ids.map((id) => canonicalJson(defaultAvatar(id)))).size).toBeGreaterThan(1);
  });

  it('avec les variantes livrées, tirages et avatar par défaut restent valides (tête cohérente avec le corps)', () => {
    const all = new Set(AVATAR_ITEMS.map((i) => i.spriteKey));
    const v = codeCatalogView(NO_PROGRESS, all);
    const rnd = mulberry32(11);
    const bodies = new Set<string>();
    for (let k = 0; k < 60; k += 1) {
      const c = randomAvatar(() => true, rnd, all);
      bodies.add(c.layers.body?.item ?? '');
      expect(checkConfig(c, v).ok, JSON.stringify(c.layers.body) + JSON.stringify(c.layers.head)).toBe(true);
    }
    expect(bodies.size).toBeGreaterThan(3);
    expect(checkConfig(defaultAvatar('0199a0b0-0000-7000-8000-00000000000d', all), v).ok).toBe(true);
  });

  it('le catalogue propose au moins 12 teintes de peau', () => {
    expect(PALETTES.filter((p) => p.slot === 'skin').length).toBeGreaterThanOrEqual(12);
  });
});

describe('aperçu de l\'éditeur (§10.4, audit lot 8 M2)', () => {
  const fakeTimers = () => {
    const ticks: (() => void)[] = [];
    let cleared = 0;
    return { ticks, cleared: () => cleared, timers: { setInterval: (fn: () => void) => { ticks.push(fn); return ticks.length; }, clearInterval: () => { cleared += 1; } } };
  };
  const storeOf = () => {
    const subs = new Set<() => void>();
    let state = { draft: base(), dir: 'bas' as const };
    return { getState: () => state, subscribe: (fn: () => void) => { subs.add(fn); return () => subs.delete(fn); }, set: (d: ReturnType<typeof base>) => { state = { ...state, draft: d }; subs.forEach((f) => f()); }, subs };
  };

  it('à l\'arrêt, aucun minuteur : un dessin initial puis un par changement du brouillon', () => {
    const t = fakeTimers();
    const s = storeOf();
    const draws: string[] = [];
    const stop = startPreview({ getState: s.getState, subscribe: s.subscribe, walking: false, timers: t.timers, draw: (_d, _dir, pose) => draws.push(pose) });
    expect(t.ticks).toHaveLength(0);
    expect(draws).toEqual(['arret']);
    s.set(normalizeConfig({ ...base(), layers: { ...base().layers, hair_front: { item: 'hair_long', palettes: ['hair_blond'] } } }));
    expect(draws).toEqual(['arret', 'arret']);
    stop();
    expect(s.subs.size).toBe(0);
  });

  it('en marche, le minuteur fait défiler les 4 frames, et il est arrêté au démontage', () => {
    const t = fakeTimers();
    const s = storeOf();
    const draws: string[] = [];
    const stop = startPreview({ getState: s.getState, subscribe: s.subscribe, walking: true, timers: t.timers, draw: (_d, _dir, pose) => draws.push(pose) });
    expect(t.ticks).toHaveLength(1);
    for (let i = 0; i < 4; i += 1) t.ticks[0]?.();
    expect(draws).toEqual(['marche-f1', 'marche-f2', 'marche-f3', 'marche-f4', 'marche-f1']);
    stop();
    expect(t.cleared()).toBe(1);
  });
});

describe('variantes de silhouette (§10.1, demande de sprites)', () => {
  const available = new Set(['haut-tshirt', 'haut-tshirt@ronde-grande', 'bas-pantalon']);
  it('un calque ajusté prend la variante du gabarit si elle est livrée, sinon la variante de base', () => {
    expect(frameCandidates({ layer: 'top', spriteKey: 'haut-tshirt', gabarit: 'ronde-grande', dir: 'bas', pose: 'marche-f2', available })).toEqual([
      'avatar/haut-tshirt@ronde-grande-bas-marche-f2.png', 'avatar/haut-tshirt@ronde-grande-bas-arret.png', 'avatar/haut-tshirt-bas-marche-f2.png', 'avatar/haut-tshirt-bas-arret.png',
    ]);
    expect(frameCandidates({ layer: 'bottom', spriteKey: 'bas-pantalon', gabarit: 'ronde-grande', dir: 'bas', pose: 'arret', available })).toEqual(['avatar/bas-pantalon-bas-arret.png']);
    // Un calque de tête n'a pas de variante par gabarit : il est décalé.
    expect(frameCandidates({ layer: 'hair_front', spriteKey: 'cheveux-court', gabarit: 'ronde-grande', dir: 'bas', pose: 'arret', available: new Set(['cheveux-court@ronde-grande']) })).toEqual(['avatar/cheveux-court-bas-arret.png']);
  });

  it('les calques de tête sont décalés selon le gabarit, par pose puis par défaut ; jamais pour le gabarit de base', () => {
    const table = gabaritsSchema.parse({ v: 1, gabarits: { 'mince-grande': { '*': [0, -6], 'bas-marche-f2': [0, -7] } } });
    expect(headOffset(table, 'head', 'mince-grande', 'bas', 'marche-f2')).toEqual([0, -7]);
    expect(headOffset(table, 'headwear', 'mince-grande', 'gauche', 'arret')).toEqual([0, -6]);
    expect(headOffset(table, 'top', 'mince-grande', 'bas', 'arret')).toEqual([0, 0]);
    expect(headOffset(table, 'head', 'moyenne-moyenne', 'bas', 'arret')).toEqual([0, 0]);
    expect(headOffset(null, 'head', 'mince-grande', 'bas', 'arret')).toEqual([0, 0]);
  });
});
