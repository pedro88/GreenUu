import { describe, expect, it } from 'vitest';
import { bands, DEFAULT_PLANTS, drawnCounts, fillCount, plantableRect, MAX_PLANTS_PER_CULTURE, MAX_PLANTS_PER_SCENE, plantCountOf, plantSpots } from '@/features/scene/fill.pure';

/* Remplissage des parcelles (SPEC §12.11) : nombre de plants, bandes, positions. */

const none = { plantCount: null, areaM2: null, spacingPlantCm: null, spacingRowCm: null, density: null, densityUnit: null };

describe('remplissage des parcelles', () => {
  it('[FIL-02] carottes de 2 m² sans nombre de plants : déduit de la surface et des distances, borné à 48 dessinés', () => {
    // Carottes à 5 cm × 25 cm : 80 plants par m², 160 sur 2 m².
    expect(plantCountOf({ ...none, areaM2: 2, spacingPlantCm: 5, spacingRowCm: 25 }, 1)).toEqual({ count: 160, source: 'estimated' });
    // Les plants dessinés remplissent la bande (un par tuile), sans dépasser 48 par culture.
    expect(fillCount({ x: 0, y: 0, w: 200, h: 300 }, 50)).toBe(24);
    expect(fillCount({ x: 0, y: 0, w: 10, h: 10 }, 50)).toBe(1);
    // La rangée du bas d'une planche ou d'un carré (le bord en bois) ne reçoit pas de plants ; les autres zones, si.
    expect(plantableRect({ x: 0, y: 0, w: 200, h: 300 }, 'bed', 50)).toEqual({ x: 0, y: 0, w: 200, h: 250 });
    expect(plantableRect({ x: 0, y: 0, w: 200, h: 300 }, 'plot', 50)).toEqual({ x: 0, y: 0, w: 200, h: 300 });
    expect(plantableRect({ x: 0, y: 0, w: 50, h: 50 }, 'square_bed', 50)).toEqual({ x: 0, y: 0, w: 50, h: 50 });
    expect(drawnCounts([fillCount({ x: 0, y: 0, w: 500, h: 500 }, 50)])).toEqual([MAX_PLANTS_PER_CULTURE]);
    // Sans surface saisie : celle de la bande occupée ; sans distances : un défaut.
    expect(plantCountOf({ ...none, spacingPlantCm: 50, spacingRowCm: 80 }, 2)).toEqual({ count: 5, source: 'estimated' });
    expect(plantCountOf(none, 2)).toEqual({ count: DEFAULT_PLANTS, source: 'default' });
    expect(plantCountOf({ ...none, plantCount: 8 }, 2)).toEqual({ count: 8, source: 'input' });
  });

  it('[FIL-03] deux cultures dans la même planche : des bandes proportionnelles, sans chevauchement', () => {
    const planche = { x: 100, y: 100, w: 300, h: 100 };
    const [a, b] = bands(planche, [2, 1]);
    expect(a).toEqual({ x: 100, y: 100, w: 200, h: 100 });
    expect(b).toEqual({ x: 300, y: 100, w: 100, h: 100 });
    // Planche verticale : découpe dans la hauteur.
    const [c, d] = bands({ x: 0, y: 0, w: 100, h: 400 }, [1, 1]);
    expect(c?.h).toBe(200);
    expect(d?.y).toBe(200);
  });

  it('[FIL-04] positions et miroirs identiques d\'un rendu à l\'autre, dans la bande', () => {
    const band = { x: 100, y: 100, w: 200, h: 100 };
    const spots = plantSpots('culture-1', band, 8, 50);
    expect(plantSpots('culture-1', band, 8, 50)).toEqual(spots);
    expect(spots).toHaveLength(8);
    expect(spots.every((p) => p.x >= 95 && p.x <= 305 && p.y >= 95 && p.y <= 205)).toBe(true);
    expect(new Set(spots.map((p) => p.mirror)).size).toBe(2);
    expect(plantSpots('culture-2', band, 8, 50)).not.toEqual(spots);
    // Deux rangs en quinconce : le second rang est décalé.
    const rows = [...new Set(spots.map((p) => Math.round(p.y / 25)))];
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });

  it('[FIL-06] au plus 200 plants par scène, au moins un par culture', () => {
    const drawn = drawnCounts([48, 48, 48, 48, 48, 48, 1, 1]);
    expect(drawn.reduce((s, n) => s + n, 0)).toBeLessThanOrEqual(MAX_PLANTS_PER_SCENE);
    expect(drawn.every((n) => n >= 1)).toBe(true);
    expect(drawnCounts([3, 4])).toEqual([3, 4]);
  });
});
