/** Règles pures des bilans (RG-RES-02 à 04). */

export type ResultFields = {
  totalKg: number | null;
  noHarvest: boolean;
  quality: number | null;
  successPct: number | null;
  rating: number | null;
  wouldGrowAgain: boolean | null;
  problemsReviewed: boolean;
};

/**
 * RG-RES-03 : 20 % par champ requis renseigné (rendement ou « pas de récolte », qualité, réussite, note,
 * « je recommencerais »). 100 % exige en plus que les problèmes aient été passés en revue : sinon, plafond à 80 %.
 */
export function completeness(r: ResultFields): number {
  const filled = [r.noHarvest || r.totalKg !== null, r.quality !== null, r.successPct !== null, r.rating !== null, r.wouldGrowAgain !== null].filter(Boolean).length;
  const pct = filled * 20;
  return pct === 100 && !r.problemsReviewed ? 80 : pct;
}

/** RG-RES-04 : rendement au m² si la surface est connue (arrondi au gramme), sinon null. */
export function yieldKgM2(totalKg: number | null, areaM2: number | null): number | null {
  if (totalKg === null || areaM2 === null || areaM2 <= 0) return null;
  return Math.round((totalKg / areaM2) * 1000) / 1000;
}

/** Seuil de partage (RG-RES-05) et de k-anonymat des agrégats (§11.3). */
export const SHARE_MIN_COMPLETENESS = 60;
export const K_ANONYMITY = 5;
