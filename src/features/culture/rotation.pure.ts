import { seasonYearOf } from '../season/season.pure';
import type { RectGeometry } from '../zone/tree';

/** Rotations et associations (RG-ROT-01 à 04). Fonctions pures. */

/** Années de saison touchées par une période d'occupation. */
export function seasonYearsTouched(from: string | null, to: string | null, startMonth: number): number[] {
  if (!from) return [];
  const a = seasonYearOf(from, startMonth);
  const b = to ? seasonYearOf(to, startMonth) : a;
  const years: number[] = [];
  for (let y = a; y <= Math.max(a, b); y++) years.push(y);
  return years;
}

export type PastCulture = {
  cultureId: string; familyId: string; label: string; zoneName: string; years: number[]; perennial: boolean; greenManure: boolean;
};

export type RotationWarning = { familyId: string; lastYear: number; returnYear: number; cultures: { id: string; label: string; zoneName: string; year: number }[] };

/**
 * Retour trop précoce d'une famille : cultures de la même famille, sur la zone, un ancêtre ou un descendant,
 * dans les (délai − 1) saisons précédant `year`. Vivaces et engrais verts n'alertent pas (RG-ROT-03).
 */
export function rotationWarning(input: {
  familyId: string; returnYears: number; year: number; perennial: boolean; greenManure: boolean; history: PastCulture[];
}): RotationWarning | null {
  if (input.perennial || input.greenManure || input.returnYears <= 1) return null;
  const minYear = input.year - (input.returnYears - 1);
  const hits = input.history.flatMap((c) => {
    if (c.familyId !== input.familyId || c.perennial || c.greenManure) return [];
    const ys = c.years.filter((y) => y >= minYear && y <= input.year - 1);
    const year = Math.max(...ys);
    return ys.length ? [{ id: c.cultureId, label: c.label, zoneName: c.zoneName, year }] : [];
  });
  if (hits.length === 0) return null;
  const lastYear = Math.max(...hits.map((h) => h.year));
  return { familyId: input.familyId, lastYear, returnYear: lastYear + input.returnYears, cultures: hits.sort((a, b) => b.year - a.year) };
}

/** Deux zones sont voisines si leurs rectangles se touchent ou sont à moins d'une tuile (RG-ROT-04). */
export function areNeighbors(a: RectGeometry, b: RectGeometry, toleranceCm: number): boolean {
  const gapX = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w));
  const gapY = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h));
  return gapX <= toleranceCm && gapY <= toleranceCm;
}

export function periodsOverlap(a: { from: string | null; to: string | null }, b: { from: string | null; to: string | null }): boolean {
  if (!a.from || !b.from) return false;
  const aTo = a.to ?? '9999-12-31';
  const bTo = b.to ?? '9999-12-31';
  return a.from <= bTo && b.from <= aTo;
}
