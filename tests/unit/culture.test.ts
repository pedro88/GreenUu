import { describe, expect, it } from 'vitest';
import { areNeighbors, rotationWarning, seasonYearsTouched } from '@/features/culture/rotation.pure';
import { cultureArea, deriveStatus, firstDate, harvestKg, occupation, orderWarnings, planStages, stagesFor, type StageRow } from '@/features/culture/stages.pure';
import { companionsOf } from '@/features/plant/companions.pure';
import { seasonYearOf } from '@/features/season/season.pure';
import { normalizeSearch } from '@/lib/text';

describe('étapes', () => {
  it('[CUL-01] semis en godet d\'un légume-fruit : semis → fin', () => {
    expect(stagesFor('tray_sowing', 'fruit')).toEqual(['sowing', 'emergence', 'transplanting', 'planting', 'flowering', 'fruiting', 'harvest_start', 'harvest_end', 'end']);
  });

  it('[CUL-05] plants achetés : ni semis ni levée, la plantation vient en premier', () => {
    const s = stagesFor('bought_plants', 'fruit');
    expect(s[0]).toBe('planting');
    expect(s).not.toContain('sowing');
    expect(s).not.toContain('emergence');
    expect(stagesFor('direct_sowing', 'root')).toEqual(['sowing', 'emergence', 'harvest_start', 'harvest_end', 'end']);
  });

  it('planification : dates croissantes et cohérentes', () => {
    const p = planStages('tray_sowing', 'fruit', '2026-03-15', { min: 70, max: 120 });
    expect(p.sowing).toBe('2026-03-15');
    const ordered = ['sowing', 'emergence', 'transplanting', 'planting', 'harvest_start', 'harvest_end', 'end'] as const;
    const dates = ordered.map((k) => p[k] ?? '');
    expect([...dates].sort()).toEqual(dates);
  });

  it('[CUL-02] statut dérivé : planned → active → finished', () => {
    const sow = (actualOn: string | null): StageRow => ({ stage: 'sowing', plannedOn: '2026-03-15', actualOn });
    const end = (actualOn: string | null): StageRow => ({ stage: 'end', plannedOn: '2026-09-01', actualOn });
    expect(deriveStatus([sow(null), end(null)], 'planned')).toBe('planned');
    expect(deriveStatus([sow('2026-03-16'), end(null)], 'planned')).toBe('active');
    expect(deriveStatus([sow('2026-03-16'), end('2026-09-02')], 'active')).toBe('finished');
    expect(deriveStatus([sow(null), end(null)], 'abandoned')).toBe('abandoned');
  });

  it('[CUL-04] une levée réelle avant le semis réel est signalée', () => {
    expect(orderWarnings([{ stage: 'sowing', plannedOn: null, actualOn: '2026-04-10' }, { stage: 'emergence', plannedOn: null, actualOn: '2026-04-05' }]))
      .toEqual([{ before: 'sowing', after: 'emergence' }]);
  });

  it('[CUL-08] occupation : un semis en godet occupe la zone à partir de la plantation', () => {
    const occ = occupation('tray_sowing', [
      { stage: 'sowing', plannedOn: '2026-03-01', actualOn: '2026-03-02' }, { stage: 'planting', plannedOn: '2026-05-15', actualOn: null },
      { stage: 'harvest_end', plannedOn: '2026-09-15', actualOn: null },
    ]);
    expect(occ).toEqual({ from: '2026-05-15', to: '2026-09-15' });
  });

  it('[SEA-01] une culture semée le 10/08/2026 dans un jardin à saison de juillet est en saison 2026', () => {
    const first = firstDate([{ stage: 'sowing', plannedOn: '2026-08-10', actualOn: null }]);
    expect(seasonYearOf(first ?? '', 7)).toBe(2026);
  });
});

describe('surfaces et récoltes', () => {
  it('[CUL-06] 12 plants espacés de 50 × 70 cm → 4,2 m², source « espacement »', () => {
    expect(cultureArea({ areaM2: null, plantCount: 12, spacingPlantCm: 50, spacingRowCm: 70, zoneSurfaceM2: 3, aloneOnZone: true })).toEqual({ m2: 4.2, source: 'spacing' });
    expect(cultureArea({ areaM2: null, plantCount: null, spacingPlantCm: 50, spacingRowCm: 70, zoneSurfaceM2: 3.6, aloneOnZone: true })).toEqual({ m2: 3.6, source: 'zone' });
    expect(cultureArea({ areaM2: null, plantCount: null, spacingPlantCm: 50, spacingRowCm: 70, zoneSurfaceM2: 3.6, aloneOnZone: false })).toEqual({ m2: null, source: 'unknown' });
  });

  it('[JRN-06] 12 courgettes à 300 g pièce → 3,6 kg', () => {
    expect(harvestKg(12, 'unit', 300)).toBe(3.6);
    expect(harvestKg(850, 'g', null)).toBe(0.85);
  });

  it('[JRN-07] 3 bottes sans poids unitaire → inconvertible', () => {
    expect(harvestKg(3, 'bunch', null)).toBeNull();
    expect(harvestKg(3, 'unit', null)).toBeNull();
  });
});

describe('rotations', () => {
  const tomato2025 = { cultureId: 'c1', familyId: 'sol', label: 'Tomate', zoneName: 'Planche 1', years: [2025], perennial: false, greenManure: false };

  it('[ROT-01] solanacées en 2025, retour conseillé en 2029', () => {
    expect(rotationWarning({ familyId: 'sol', returnYears: 4, year: 2026, perennial: false, greenManure: false, history: [tomato2025] }))
      .toMatchObject({ lastYear: 2025, returnYear: 2029 });
  });

  it('[ROT-03] tomates en 2022 puis 2026 avec un délai de 4 ans : pas d\'alerte', () => {
    expect(rotationWarning({ familyId: 'sol', returnYears: 4, year: 2026, perennial: false, greenManure: false, history: [{ ...tomato2025, years: [2022] }] })).toBeNull();
    expect(rotationWarning({ familyId: 'sol', returnYears: 4, year: 2026, perennial: true, greenManure: false, history: [tomato2025] })).toBeNull();
  });

  it('[CUL-09] une culture à cheval sur deux saisons les touche toutes les deux', () => {
    expect(seasonYearsTouched('2025-11-05', '2026-07-10', 1)).toEqual([2025, 2026]);
  });

  it('[ROT-05] zones voisines : bord partagé ou écart d\'au plus une tuile', () => {
    const a = { v: 1 as const, kind: 'rect' as const, x: 0, y: 0, w: 300, h: 120 };
    expect(areNeighbors(a, { ...a, y: 120 }, 50)).toBe(true);
    expect(areNeighbors(a, { ...a, y: 160 }, 50)).toBe(true);
    expect(areNeighbors(a, { ...a, y: 400 }, 50)).toBe(false);
  });
});

describe('référentiel', () => {
  it('[PLT-05] les associations sont symétriques', () => {
    const rows = [{ speciesAId: 'basilic', speciesBId: 'tomate', effect: 'favorable' as const }];
    expect(companionsOf(rows, 'basilic')).toEqual([{ speciesId: 'tomate', effect: 'favorable' }]);
    expect(companionsOf(rows, 'tomate')).toEqual([{ speciesId: 'basilic', effect: 'favorable' }]);
  });

  it('[PLT-01] normalisation de recherche : casse, accents et ligatures', () => {
    expect(normalizeSearch('Cœur de Bœuf')).toBe('coeur de boeuf');
    expect(normalizeSearch('  Épinard   d\'hiver ')).toBe('epinard d hiver');
  });
});
