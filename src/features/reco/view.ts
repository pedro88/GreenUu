import type { Executor } from '@/server/db/client';
import type { Scope } from '@/server/authz/scope';
import { createEngineV1, type RecommendationEngine, type VarietyRecommendation } from './engine';

export const PERIODS = ['spring', 'summer', 'autumn', 'winter'] as const;
export type Period = (typeof PERIODS)[number];

/** Période demandée (hémisphère nord ; le sud est décalé de six mois). */
export function periodRange(period: Period, year: number, south = false): { from: Date; to: Date } {
  const months: Record<Period, [number, number]> = { spring: [2, 4], summer: [5, 7], autumn: [8, 10], winter: [11, 13] };
  const [a, b] = months[period];
  const shift = south ? 6 : 0;
  return { from: new Date(Date.UTC(year, a + shift, 1)), to: new Date(Date.UTC(year, b + shift + 1, 0)) };
}

export function currentPeriod(month0: number): Period {
  return month0 >= 2 && month0 <= 4 ? 'spring' : month0 >= 5 && month0 <= 7 ? 'summer' : month0 >= 8 && month0 <= 10 ? 'autumn' : 'winter';
}

let factory: (tx: Executor) => RecommendationEngine = createEngineV1;

/** Point d'injection unique du moteur (RCO-10) : l'UI ne connaît que l'interface `RecommendationEngine`. */
export function engineFor(tx: Executor): RecommendationEngine {
  return factory(tx);
}

/** Tests de contrat : remplace l'implémentation, renvoie de quoi la restaurer. */
export function provideEngine(f: (tx: Executor) => RecommendationEngine): () => void {
  const previous = factory;
  factory = f;
  return () => { factory = previous; };
}

export type RecommendationView = { version: string; items: VarietyRecommendation[]; coldStart: VarietyRecommendation[] };

/** Données de la page `/recommandations`, quel que soit le moteur. */
export async function recommendationView(tx: Executor, scope: Scope, q: { zoneId: string; period: Period; year: number; speciesId?: string | undefined }): Promise<RecommendationView> {
  const engine = engineFor(tx);
  const { from, to } = periodRange(q.period, q.year);
  const all = await engine.recommendVarieties({ gardenId: scope.gardenId, zoneId: q.zoneId, from, to, ...(q.speciesId ? { speciesId: q.speciesId } : {}), limit: 12 }, scope);
  return { version: engine.version, items: all.filter((r) => r.explanation.confidence !== 'cold_start'), coldStart: all.filter((r) => r.explanation.confidence === 'cold_start') };
}
