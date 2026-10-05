/*
 * Dates calendaires `YYYY-MM-DD` (sans heure ni fuseau) : arithmétique pure, en UTC à midi, pour qu'aucun changement
 * d'heure ni fuseau du processus ne décale le jour. Une seule implémentation pour tout le code (audit de suivi, DRY).
 */

const DAY_MS = 86_400_000;
const noon = (iso: string) => Date.parse(`${iso}T12:00:00Z`);
const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** `iso` décalée de `days` jours (négatif : avant). */
export function addDaysIso(iso: string, days: number): string {
  return toIso(noon(iso) + days * DAY_MS);
}

/** Nombre de jours de `a` à `b` (négatif si `b` est avant `a`). */
export function daysBetweenIso(a: string, b: string): number {
  return Math.round((noon(b) - noon(a)) / DAY_MS);
}

/** `iso` décalée de `months` mois, au même quantième borné à la fin du mois (31 janvier + 1 mois = 28 ou 29 février). */
export function addMonthsIso(iso: string, months: number): string {
  const [y = 2000, m = 1, d = 1] = iso.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return `${first.getUTCFullYear()}-${String(first.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

/** Lundi de la semaine ISO de `iso`. */
export function weekStartIso(iso: string): string {
  return addDaysIso(iso, -((new Date(noon(iso)).getUTCDay() + 6) % 7));
}

/** Jour de la semaine de `iso` : 0 = dimanche … 6 = samedi. */
export function weekdayIso(iso: string): number {
  return new Date(noon(iso)).getUTCDay();
}
