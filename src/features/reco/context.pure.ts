import { decodeGeohash } from '@/lib/geohash';
import type { Environment } from '@/lib/enums';

/**
 * Distance de contexte (SPEC §7.2) : somme pondérée de distances partielles normalisées, dans [0, 1].
 * Poids et seuils versionnés ; ils ne changent qu'avec la spec.
 */
export const RECO_WEIGHTS_V1 = { koppen: 0.25, environment: 0.2, altitude: 0.15, latitude: 0.1, hardiness: 0.05, soil: 0.1, ph: 0.05, practices: 0.1 } as const;
export const SIMILARITY_THRESHOLD_V1 = 0.35;

export type Context = {
  koppen?: string | null;
  environment?: Environment | null;
  altitudeM?: number | null;
  geohash4?: string | null;
  hardinessZone?: string | null;
  soilType?: string | null;
  soilPh?: number | null;
  practices?: string[] | null;
};

const UNKNOWN = 0.5;
const SOILLESS: Environment[] = ['indoor', 'soilless', 'hydroponic'];

export function koppenDistance(a?: string | null, b?: string | null): number {
  if (!a || !b) return UNKNOWN;
  if (a === b) return 0;
  if (a.slice(0, 2) === b.slice(0, 2)) return 0.3;
  if (a[0] === b[0]) return 0.6;
  return 1;
}

const pair = (a: Environment, b: Environment, x: Environment, y: Environment) => (a === x && b === y) || (a === y && b === x);

export function environmentDistance(a?: Environment | null, b?: Environment | null): number {
  if (!a || !b) return UNKNOWN;
  if (a === b) return 0;
  if (pair(a, b, 'greenhouse', 'tunnel') || pair(a, b, 'open_air', 'balcony_roof')) return 0.4;
  if (SOILLESS.includes(a) && SOILLESS.includes(b)) return 0.6;
  return 1;
}

/** Sols voisins (matrice §7.2) : texture proche ou substrat comparable. */
const SOIL_NEIGHBORS: [string, string][] = [['loam', 'silty'], ['loam', 'clay'], ['loam', 'sandy'], ['silty', 'clay'], ['sandy', 'stony'], ['chalky', 'stony'], ['peaty', 'potting_mix']];

export function soilDistance(a?: string | null, b?: string | null): number {
  if (!a || !b || a === 'unknown' || b === 'unknown') return UNKNOWN;
  if (a === b) return 0;
  return SOIL_NEIGHBORS.some(([x, y]) => (a === x && b === y) || (a === y && b === x)) ? 0.5 : 1;
}

/** Zone de rusticité « 8a » → demi-zones (8a = 16, 8b = 17). */
function halfZones(z: string): number | null {
  const m = /^(\d{1,2})([ab])?$/.exec(z.trim());
  return m ? Number(m[1]) * 2 + (m[2] === 'b' ? 1 : 0) : null;
}

const INFLUENTIAL = (p: string) => ['organic', 'no_dig', 'living_soil', 'mulching', 'green_manure'].includes(p) || p.startsWith('irrigation_');

export function practicesDistance(a?: string[] | null, b?: string[] | null): number {
  const x = new Set((a ?? []).filter(INFLUENTIAL));
  const y = new Set((b ?? []).filter(INFLUENTIAL));
  const union = new Set([...x, ...y]);
  if (union.size === 0) return 0;
  return 1 - [...x].filter((p) => y.has(p)).length / union.size;
}

/** Filtre dur : hors-sol et intérieur ne se comparent jamais au plein air. */
export function excluded(a: Context, b: Context): boolean {
  return (a.environment === 'open_air' && !!b.environment && SOILLESS.includes(b.environment))
    || (b.environment === 'open_air' && !!a.environment && SOILLESS.includes(a.environment));
}

export function contextDistance(a: Context, b: Context): number {
  const w = RECO_WEIGHTS_V1;
  const latA = a.geohash4 ? decodeGeohash(a.geohash4).lat : null;
  const latB = b.geohash4 ? decodeGeohash(b.geohash4).lat : null;
  const latitude = latA === null || latB === null ? UNKNOWN : Math.sign(latA) !== Math.sign(latB) ? 1 : Math.min(Math.abs(latA - latB) / 8, 1);
  const altitude = a.altitudeM == null || b.altitudeM == null ? UNKNOWN : Math.min(Math.abs(a.altitudeM - b.altitudeM) / 800, 1);
  const hA = a.hardinessZone ? halfZones(a.hardinessZone) : null;
  const hB = b.hardinessZone ? halfZones(b.hardinessZone) : null;
  const hardiness = hA === null || hB === null ? UNKNOWN : Math.min(Math.abs(hA - hB) / 4, 1);
  const ph = a.soilPh == null || b.soilPh == null ? UNKNOWN : Math.min(Math.abs(a.soilPh - b.soilPh) / 2, 1);
  const d = w.koppen * koppenDistance(a.koppen, b.koppen) + w.environment * environmentDistance(a.environment, b.environment)
    + w.altitude * altitude + w.latitude * latitude + w.hardiness * hardiness + w.soil * soilDistance(a.soilType, b.soilType)
    + w.ph * ph + w.practices * practicesDistance(a.practices, b.practices);
  return Math.round(d * 1e6) / 1e6;
}
