import { describe, expect, it } from 'vitest';
import { cultureArea, estimatedPlantCount, plantsPerM2 } from '@/features/culture/stages.pure';

/* Distances et densité de plantation et de semis (SPEC RG-CUL-06, lot 9). */

describe('densité de plantation', () => {
  it('[PLA-02] plants par m² et nombre de plants estimé, selon les distances ou la densité saisies', () => {
    // Tomates à 50 cm entre les plants et 80 cm entre les rangs : 2,5 plants par m², 5 plants sur 2 m².
    const tomates = plantsPerM2({ spacingPlantCm: 50, spacingRowCm: 80 });
    expect(tomates).toBe(2.5);
    expect(estimatedPlantCount(2, tomates)).toBe(5);
    // Densité saisie en plants par m² : prioritaire sur les distances.
    expect(plantsPerM2({ spacingPlantCm: 50, spacingRowCm: 80, density: 9, densityUnit: 'plants_per_m2' })).toBe(9);
    // Carottes semées à 40 graines par mètre de rang, rangs à 25 cm : 160 graines par m².
    expect(plantsPerM2({ spacingPlantCm: null, spacingRowCm: 25, density: 40, densityUnit: 'seeds_per_m' })).toBe(160);
    expect(estimatedPlantCount(1.5, 160)).toBe(240);
    // Sans écartement des rangs, des graines par mètre ne donnent pas de densité ; sans surface, pas d'estimation.
    expect(plantsPerM2({ spacingPlantCm: null, spacingRowCm: null, density: 40, densityUnit: 'seeds_per_m' })).toBeNull();
    expect(estimatedPlantCount(null, 2.5)).toBeNull();
    expect(plantsPerM2({ spacingPlantCm: 30, spacingRowCm: null })).toBeNull();
  });

  it('la surface déduite suit la densité saisie (RG-CUL-06)', () => {
    expect(cultureArea({ areaM2: null, plantCount: 18, spacingPlantCm: null, spacingRowCm: null, density: 9, densityUnit: 'plants_per_m2', zoneSurfaceM2: 5, aloneOnZone: true }))
      .toEqual({ m2: 2, source: 'spacing' });
  });
});
