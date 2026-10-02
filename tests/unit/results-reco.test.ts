import { describe, expect, it } from 'vitest';
import { adjust, adjustedWindow, capPerGarden, confidenceOf, partitionOwn, scoreGroup, similarity, smoothedScore, type Fact } from '@/features/reco/score.pure';
import { completeness, yieldKgM2 } from '@/features/result/rules.pure';

const ctx = { koppen: 'Cfb', environment: 'open_air' as const, geohash4: 'u0hq', altitudeM: 100, soilType: 'loam', soilPh: 6.5, hardinessZone: '8a', practices: ['organic'] };
let seq = 0;
const fact = (garden: string, over: Partial<Fact> = {}): Fact & { s: number } => {
  seq += 1;
  return { ...ctx, factId: `f${String(seq).padStart(4, '0')}`, gardenPseudo: garden, speciesId: 'tomate', varietyId: 'v1', method: 'bought_plants', successPct: 80, rating: 4, yieldKgM2: 2, problemCodes: [], year: 2025, s: 1, ...over };
};

describe('bilans', () => {
  it('[RES-03] sans taux de réussite ni note, la complétude vaut 60 %', () => {
    expect(completeness({ totalKg: 4.2, noHarvest: false, quality: 4, successPct: null, rating: null, wouldGrowAgain: true, problemsReviewed: true })).toBe(60);
    expect(completeness({ totalKg: null, noHarvest: true, quality: 4, successPct: 80, rating: 4, wouldGrowAgain: true, problemsReviewed: true })).toBe(100);
    expect(completeness({ totalKg: 4.2, noHarvest: false, quality: 4, successPct: 80, rating: 4, wouldGrowAgain: true, problemsReviewed: false })).toBe(80);
  });

  it('[RES-04] sans surface connue, yield_kg_m2 est null ; sinon kg / m²', () => {
    expect(yieldKgM2(4.2, null)).toBeNull();
    expect(yieldKgM2(4.2, 3)).toBe(1.4);
  });
});

describe('moteur de recommandation', () => {
  it('[RCO-02] au plus 3 faits par jardin : 3 + 4 faits → n = 5 jardins, confiance low', () => {
    const facts = [...Array.from({ length: 6 }, () => fact('A')), ...['B', 'C', 'D', 'E'].map((g) => fact(g))];
    const capped = capPerGarden(facts);
    expect(capped.filter((f) => f.gardenPseudo === 'A')).toHaveLength(3);
    const g = scoreGroup(facts, 0.6, () => 0.5);
    expect(g.gardensCount).toBe(5);
    expect(g.resultsCount).toBe(7);
    expect(g.confidence).toBe('low');
  });

  it('[RCO-03] 20 jardins similaires : lissage bayésien (k = 5), confiance high, explication chiffrée', () => {
    const successes = [70, 86];
    const facts = Array.from({ length: 20 }, (_, i) => fact(`G${i}`, { successPct: successes[i % 2] ?? 78, yieldKgM2: i < 10 ? 2.0 : 2.2 }));
    const g = scoreGroup(facts, 0.6, () => 0.5);
    expect(g.confidence).toBe('high');
    expect(g.gardensCount).toBe(20);
    expect(g.meanSuccessPct).toBe(78);
    expect(g.medianYieldKgM2).toBeCloseTo(2.1, 6);
    const raw = facts.map((f) => ({ s: 1, o: 0.5 * (f.successPct ?? 0) / 100 + 0.3 * 0.75 + 0.2 * 0.5 }));
    expect(g.score).toBeCloseTo(smoothedScore(raw, 0.6), 9);
    expect(g.score).not.toBeCloseTo(raw.reduce((a, x) => a + x.o, 0) / raw.length, 3);
  });

  it('[RCO-05] moins de 5 jardins distincts : démarrage à froid', () => {
    expect(confidenceOf(3, [1, 1, 1])).toBe('cold_start');
    expect(confidenceOf(8, Array(8).fill(1))).toBe('medium');
  });

  it('[RCO-06] fenêtre ajustée : P20, médiane et P80 pondérés, faits à résultat ≥ 0,6 seulement', () => {
    const points = [
      { doy: 100, weight: 1, outcome: 0.8 }, { doy: 110, weight: 1, outcome: 0.8 }, { doy: 120, weight: 2, outcome: 0.9 },
      { doy: 130, weight: 1, outcome: 0.7 }, { doy: 140, weight: 5, outcome: 0.5 },
    ];
    // Poids cumulés normalisés (sans le dernier fait, < 0,6) : 0,2 · 0,4 · 0,8 · 1.
    expect(adjustedWindow(points)).toEqual({ start: 100, optimum: 120, end: 120 });
  });

  it('[RCO-07] les faits de l\'hémisphère sud sont exclus pour un jardin du nord', () => {
    expect(similarity(ctx, { ...ctx })).toBe(1);
    expect(similarity(ctx, { ...ctx, geohash4: 'r3gx' })).toBeNull();
  });

  it('[RCO-08] un conflit de rotation multiplie le score par 0,7', () => {
    expect(adjust(0.8, { rotation: true })).toBeCloseTo(0.56, 9);
    expect(adjust(0.8, { rotation: true, unfavorableCompanion: true })).toBeCloseTo(0.476, 9);
  });

  it('[RCO-09] les bilans du jardin courant sortent du score et vont dans l\'historique propre', () => {
    const facts = [fact('MOI'), fact('MOI'), fact('X')];
    const { community, own } = partitionOwn(facts, 'MOI');
    expect(community.map((f) => f.gardenPseudo)).toEqual(['X']);
    expect(own).toHaveLength(2);
  });
});
