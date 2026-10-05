import { describe, expect, it } from 'vitest';
import { fillCount, layoutCultures } from '@/features/scene/fill.pure';
import { validateLocal, type EditorScene, type ZoneTypeInfo } from '@/features/scene/plan.pure';
import { anchorRect, rowStrips, withRowGeometry } from '@/features/scene/rows.pure';
import type { SceneZone } from '@/features/scene/snapshot.schema';
import { GREENHOUSE_SLICES, greenhousePieces } from '@/features/scene/tiles.pure';
import { rect } from '../geometry';

/* Rangs d'une planche, serre en pièces (demandes de l'utilisateur du 2026-10-05). */

const zone = (id: string, typeCode: string, parentId: string | null, geometry: SceneZone['geometry'], name = id): SceneZone => ({
  id, name, typeCode, parentId, depth: parentId ? 1 : 0, geometry, hasInterior: typeCode === 'greenhouse', canHostCultures: true, label: name,
});
const none = { plantCount: null, areaM2: null, spacingPlantCm: null, spacingRowCm: null, density: null, densityUnit: null };

describe('rangs d\'une planche', () => {
  // Planche horizontale de 400 × 200 cm (tuiles de 50) : la rangée du bas (bord en bois) ne reçoit pas de rang.
  const bed = zone('bed', 'bed', null, rect(0, 0, 400, 200));
  const rows = (n: number) => Array.from({ length: n }, (_, i) => zone(`r${i + 1}`, 'row', 'bed', rect(0, 0, 50, 50), `Rang ${i + 1}`));

  it('[FIL-07] N rangs découpent la planche en N bandes égales, parallèles à son grand côté, dans l\'ordre de leurs noms', () => {
    for (const n of [1, 2, 3, 10]) {
      const strips = rowStrips([bed, ...rows(n)], 50);
      expect(strips.size).toBe(n);
      const list = [...strips.values()];
      expect(list.every((s) => s.x === 0 && s.w === 400)).toBe(true);
      expect(list.reduce((sum, s) => sum + s.h, 0)).toBe(150);
    }
    // « Rang 10 » après « Rang 2 », et un rang dessiné sur un autre rang compte pour la même planche.
    const nested = [bed, zone('a', 'row', 'bed', null, 'Rang 10'), zone('b', 'row', 'a', null, 'Rang 2')];
    const strips = rowStrips(nested, 50);
    expect(strips.get('b')).toEqual({ x: 0, y: 0, w: 400, h: 75 });
    expect(strips.get('a')).toEqual({ x: 0, y: 75, w: 400, h: 75 });
    // Planche verticale : bandes verticales.
    const tall = rowStrips([zone('t', 'bed', null, rect(0, 0, 100, 300)), zone('x', 'row', 't', null), zone('y', 'row', 't', null)], 50);
    expect([...tall.values()]).toEqual([{ x: 0, y: 0, w: 50, h: 250 }, { x: 50, y: 0, w: 50, h: 250 }]);
    // Affichage : la géométrie enregistrée du rang est remplacée par sa bande ; un rang sans planche placée garde la sienne.
    const shown = withRowGeometry([bed, ...rows(2), zone('lost', 'row', null, rect(500, 0, 50, 50))], 50);
    expect(shown.find((z) => z.id === 'r2')?.geometry).toEqual(rect(0, 75, 400, 75));
    expect(shown.find((z) => z.id === 'lost')?.geometry).toEqual(rect(500, 0, 50, 50));
  });

  it('[FIL-07] une culture d\'un rang pose ses plants en ligne sur la bande de ce rang, au moins un par tuile de longueur', () => {
    const strips = rowStrips([bed, ...rows(10)], 50);
    const r3 = anchorRect({ id: 'r3', geometry: null }, strips, 50);
    expect(r3).toEqual({ x: 0, y: 30, w: 400, h: 15 });
    expect(fillCount({ x: 0, y: 0, w: 400, h: 15 }, 50)).toBe(8);
    const layout = layoutCultures([{ id: 'c', anchor: r3 ? { id: 'r3', rect: r3 } : null, facts: none }], 50);
    const c = layout.get('c');
    expect(c?.footprint).toEqual({ x: 0, y: 30, w: 400, h: 15 });
    expect(c?.plants.drawn).toBe(8);
  });

  it('[FIL-08] les rangs échappent à RG-ZON-05 : ni contenance, ni chevauchement, ni blocage du déplacement de leur planche', () => {
    const types = new Map<string, ZoneTypeInfo>([['ROW', { id: 'ROW', code: 'row', label: 'Rang', canHostCultures: true, hasInteriorDefault: false }]]);
    const scene: EditorScene = { tileSizeCm: 50, zones: [bed, ...rows(2)], terrain: [], decor: [] };
    expect(validateLocal(scene, { op: 'createZone', clientId: 'tmp:x', name: 'Rang 3', zoneTypeId: 'ROW', parentId: 'bed', geometry: rect(0, 0, 50, 50) }, types)).toBeNull();
    expect(validateLocal(scene, { op: 'moveZone', zoneId: 'bed', geometry: rect(1000, 0, 400, 200) }, types)).toBeNull();
    expect(validateLocal(scene, { op: 'moveZone', zoneId: 'r1', geometry: rect(2000, 0, 50, 50) }, types)).toBeNull();
  });
});

describe('serre en pièces', () => {
  const all = () => true;

  it('[MAP-13] une serre se dessine avec les pièces de face : début, milieux, porte au centre, fin ; la neige du toit l\'hiver', () => {
    expect(greenhousePieces(1, 'summer', all)?.map((p) => p.frame)).toEqual(['structures/serre-milieu-porte.png']);
    expect(greenhousePieces(2, 'summer', all)?.map((p) => p.frame)).toEqual(['structures/serre-debut.png', 'structures/serre-fin.png']);
    expect(greenhousePieces(5, 'summer', all)?.map((p) => p.frame)).toEqual([
      'structures/serre-debut.png', 'structures/serre-milieu.png', 'structures/serre-milieu-porte.png', 'structures/serre-milieu.png', 'structures/serre-fin.png',
    ]);
    expect(greenhousePieces(8, 'summer', all)?.map((p) => p.frame.replace(/^structures\/serre-|\.png$/g, ''))).toEqual([
      'debut', 'milieu-aeration', 'milieu', 'milieu-porte', 'milieu', 'milieu-aeration', 'milieu', 'fin',
    ]);
    expect(greenhousePieces(3, 'winter', all)?.map((p) => p.snow)).toEqual(['neige/serre-toit-debut.png', 'neige/serre-toit.png', 'neige/serre-toit-fin.png']);
    expect(greenhousePieces(3, 'summer', all)?.every((p) => p.snow === null)).toBe(true);
    // Une pièce absente de l'atlas : pas de serre en pièces (le moteur garde son rendu de repli).
    expect(greenhousePieces(3, 'summer', (f) => f !== 'structures/serre-fin.png')).toBeNull();
    expect(GREENHOUSE_SLICES.top).toBeLessThan(GREENHOUSE_SLICES.bottom);
  });
});
