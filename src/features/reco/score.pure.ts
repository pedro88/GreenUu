import { contextDistance, excluded, SIMILARITY_THRESHOLD_V1, type Context } from './context.pure';
import { decodeGeohash } from '@/lib/geohash';

/** Moteur de recommandation V1 (SPEC §7.3 à 7.5) : fonctions pures, testées sans base. */
export const ENGINE_VERSION = 'reco-v1';
export const PRIOR_K = 5;
export const DEFAULT_PRIOR = 0.6;
export const FACTS_PER_GARDEN = 3;
export const COLD_START_GARDENS = 5;

export type Fact = Context & {
  factId: string;
  gardenPseudo: string;
  speciesId: string;
  varietyId: string | null;
  method: string;
  successPct: number | null;
  rating: number | null;
  yieldKgM2: number | null;
  problemCodes: string[];
  year: number;
  sowingDoy?: number | null;
  plantingDoy?: number | null;
};

export type Confidence = 'high' | 'medium' | 'low' | 'cold_start';

const hemisphere = (geohash4: string | null | undefined) => (geohash4 ? Math.sign(decodeGeohash(geohash4).lat) : 0);

/**
 * Poids de similarité `s = 1 − d / 0,35` (§7.2), ou null si le fait n'est pas comparable : distance au-delà du seuil,
 * filtre dur hors-sol / plein air, ou hémisphère opposé (RCO-07 : les saisons ne se comparent pas).
 */
export function similarity(target: Context, f: Context): number | null {
  if (excluded(target, f)) return null;
  const h1 = hemisphere(target.geohash4);
  const h2 = hemisphere(f.geohash4);
  if (h1 !== 0 && h2 !== 0 && h1 !== h2) return null;
  const d = contextDistance(target, f);
  return d <= SIMILARITY_THRESHOLD_V1 ? 1 - d / SIMILARITY_THRESHOLD_V1 : null;
}

/** Rang centile (moyen) d'une valeur parmi d'autres, dans [0, 1]. */
export function percentileRank(value: number, all: number[]): number {
  if (all.length === 0) return 0.5;
  const below = all.filter((v) => v < value).length;
  const equal = all.filter((v) => v === value).length;
  return (below + equal / 2) / all.length;
}

/**
 * Résultat unitaire `o = 0,5 × réussite + 0,3 × note + 0,2 × rang du rendement` ; une composante inconnue
 * voit son poids redistribué sur les autres (§7.3, point 1).
 */
export function outcome(f: Pick<Fact, 'successPct' | 'rating'>, pYield: number | null): number | null {
  const parts: [number, number][] = [];
  if (f.successPct !== null) parts.push([0.5, f.successPct / 100]);
  if (f.rating !== null) parts.push([0.3, (f.rating - 1) / 4]);
  if (pYield !== null) parts.push([0.2, pYield]);
  const w = parts.reduce((a, [x]) => a + x, 0);
  return w === 0 ? null : parts.reduce((a, [x, v]) => a + x * v, 0) / w;
}

/** Au plus les 3 faits les plus récents par jardin d'origine et par variété (§7.3, point 2). */
export function capPerGarden<T extends Pick<Fact, 'gardenPseudo' | 'varietyId' | 'year' | 'factId'>>(facts: T[], cap = FACTS_PER_GARDEN): T[] {
  const sorted = [...facts].sort((a, b) => b.year - a.year || a.factId.localeCompare(b.factId));
  const seen = new Map<string, number>();
  return sorted.filter((f) => {
    const key = `${f.gardenPseudo}|${f.varietyId ?? ''}`;
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    return n < cap;
  });
}

/** §7.3 point 4 : confiance d'après les jardins distincts et la taille effective ; démarrage à froid sous 5 jardins. */
export function confidenceOf(gardens: number, weights: number[]): Confidence {
  const sum = weights.reduce((a, b) => a + b, 0);
  const sq = weights.reduce((a, b) => a + b * b, 0);
  const nEff = sq === 0 ? 0 : (sum * sum) / sq;
  if (gardens < COLD_START_GARDENS) return 'cold_start';
  if (gardens >= 15 && nEff >= 10) return 'high';
  if (gardens >= 8) return 'medium';
  return 'low';
}

/** Lissage bayésien vers l'a priori `μ₀` (§7.3 point 3). */
export function smoothedScore(weighted: { s: number; o: number }[], prior: number, k = PRIOR_K): number {
  const num = weighted.reduce((a, x) => a + x.s * x.o, 0) + k * prior;
  const den = weighted.reduce((a, x) => a + x.s, 0) + k;
  return num / den;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const v = [...values].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? (v[m] ?? null) : ((v[m - 1] ?? 0) + (v[m] ?? 0)) / 2;
}

/** Percentile pondéré : première valeur dont le poids cumulé normalisé atteint `p` (§7.4). */
export function weightedPercentile(points: { value: number; weight: number }[], p: number): number | null {
  const sorted = points.filter((x) => x.weight > 0).sort((a, b) => a.value - b.value);
  const total = sorted.reduce((a, x) => a + x.weight, 0);
  if (total === 0) return null;
  let acc = 0;
  for (const x of sorted) {
    acc += x.weight;
    if (acc / total >= p - 1e-9) return x.value;
  }
  return sorted[sorted.length - 1]?.value ?? null;
}

export type ScoredGroup = {
  speciesId: string;
  varietyId: string | null;
  score: number;
  confidence: Confidence;
  gardensCount: number;
  resultsCount: number;
  meanSuccessPct: number | null;
  medianYieldKgM2: number | null;
  topProblems: { code: string; sharePct: number }[];
  /** Nombre de cultures du groupe dans les contextes similaires (départage des ex æquo). */
  popularity: number;
};

/**
 * Score d'une variété (ou d'une espèce) à partir des faits similaires déjà pondérés (§7.3, points 1 à 4).
 * `pYieldOf` donne le rang du rendement parmi les faits de la même espèce et du même environnement.
 */
export function scoreGroup(facts: (Fact & { s: number })[], prior: number, pYieldOf: (f: Fact) => number | null): Omit<ScoredGroup, 'speciesId' | 'varietyId'> {
  const capped = capPerGarden(facts);
  const weighted = capped.flatMap((f) => {
    const o = outcome(f, f.yieldKgM2 === null ? null : pYieldOf(f));
    return o === null ? [] : [{ s: f.s, o }];
  });
  const gardens = new Set(capped.map((f) => f.gardenPseudo)).size;
  const successes = capped.flatMap((f) => (f.successPct === null ? [] : [f.successPct]));
  const yields = capped.flatMap((f) => (f.yieldKgM2 === null ? [] : [f.yieldKgM2]));
  const problems = new Map<string, number>();
  for (const f of capped) for (const c of f.problemCodes) problems.set(c, (problems.get(c) ?? 0) + 1);
  return {
    score: smoothedScore(weighted, prior),
    confidence: confidenceOf(gardens, capped.map((f) => f.s)),
    gardensCount: gardens,
    resultsCount: capped.length,
    meanSuccessPct: successes.length ? Math.round(successes.reduce((a, b) => a + b, 0) / successes.length) : null,
    medianYieldKgM2: median(yields),
    topProblems: [...problems.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([code, n]) => ({ code, sharePct: Math.round((n / capped.length) * 100) })),
    popularity: facts.length,
  };
}

/** §7.3 point 5 : ajustements multiplicatifs (rotation × 0,7, association défavorable × 0,85). */
export function adjust(score: number, warnings: { rotation?: boolean; unfavorableCompanion?: boolean }): number {
  return score * (warnings.rotation ? 0.7 : 1) * (warnings.unfavorableCompanion ? 0.85 : 1);
}

/** §7.4 : fenêtre ajustée P20–P80 et optimum (médiane pondérée), sur les faits à résultat ≥ 0,6. */
export function adjustedWindow(points: { doy: number; weight: number; outcome: number }[]): { start: number; optimum: number; end: number } | null {
  const good = points.filter((p) => p.outcome >= 0.6).map((p) => ({ value: p.doy, weight: p.weight }));
  const start = weightedPercentile(good, 0.2);
  const optimum = weightedPercentile(good, 0.5);
  const end = weightedPercentile(good, 0.8);
  return start === null || optimum === null || end === null ? null : { start, optimum, end };
}

/** Décalage de 182 jours pour un jardin de l'hémisphère sud face au référentiel (saisons équivalentes, §7.4). */
export const shiftDoy = (doy: number, south: boolean) => (south ? ((doy + 181) % 366) + 1 : doy);

/** RCO-09 : les faits du jardin courant sortent du score communautaire et nourrissent l'historique propre. */
export function partitionOwn<T extends Pick<Fact, 'gardenPseudo'>>(facts: T[], ownPseudo: string | null): { community: T[]; own: T[] } {
  return { community: facts.filter((f) => f.gardenPseudo !== ownPseudo), own: facts.filter((f) => f.gardenPseudo === ownPseudo) };
}
