import { describe, expect, it } from 'vitest';
import { AVATAR_ITEMS, PALETTES } from '@/features/avatar/catalog';
import { canonicalJson, checkConfig, codeCatalogView, defaultAvatar, mulberry32, normalizeConfig, randomAvatar } from '@/features/avatar/config.pure';
import { hexToRgb, recolorPixels, RESERVED_GREYS } from '@/features/avatar/recolor.pure';
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
    const c = base();
    const forged = { ...c, layers: { ...c.layers, headwear: { item: 'hat_straw', palettes: ['straw'] } } };
    expect(checkConfig(forged, view)).toEqual({ ok: false, code: 'LOCKED_ITEM', items: ['hat_straw'] });
    expect(checkConfig(forged, view, normalizeConfig(forged)).ok).toBe(true);
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

  it('le catalogue propose au moins 12 teintes de peau', () => {
    expect(PALETTES.filter((p) => p.slot === 'skin').length).toBeGreaterThanOrEqual(12);
  });
});
