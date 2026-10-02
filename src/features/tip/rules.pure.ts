import { slugify } from '@/lib/text';

export const TIP_MIN = 10;
export const TIP_MAX = 500;
export const TIP_MAX_TAGS = 5;

/** RG-TIP-01 : tags normalisés en slugs, sans doublon. */
export function normalizeTags(raw: string[]): string[] {
  return [...new Set(raw.map((t) => slugify(t.replace(/^#/, ''), 40)).filter((t) => t.length > 0))];
}

/** Borne inférieure de l'intervalle de Wilson à 95 % (RG-TIP-03). 0 sans vote. */
export function wilsonLowerBound(up: number, down: number, z = 1.959964): number {
  const n = up + down;
  if (n === 0) return 0;
  const p = up / n;
  return (p + (z * z) / (2 * n) - z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n)) / (1 + (z * z) / n);
}

/**
 * Rang dans le fil (RG-TIP-03) : Wilson, pondéré par la proximité de contexte (1 − distance §7.2).
 * À Wilson égal, le contexte le plus proche passe devant (TIP-05) ; un tip sans vote reste classé par proximité.
 */
export function feedScore(up: number, down: number, distance: number): number {
  return 0.7 * wilsonLowerBound(up, down) + 0.3 * (1 - distance);
}
