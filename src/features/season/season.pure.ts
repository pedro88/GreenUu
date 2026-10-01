/** Saisons culturales (RG-SEA-01). Dates au format ISO `YYYY-MM-DD`. */

const pad = (n: number) => String(n).padStart(2, '0');

/** Bornes de la saison `year` pour un jardin dont la saison commence au mois `startMonth` (1–12). */
export function seasonBounds(year: number, startMonth: number): { startsOn: string; endsOn: string } {
  const startsOn = `${year}-${pad(startMonth)}-01`;
  // Jour 0 du mois de début de l'année suivante = dernier jour de la saison (12 mois).
  const end = new Date(Date.UTC(year + 1, startMonth - 1, 0));
  const endsOn = `${end.getUTCFullYear()}-${pad(end.getUTCMonth() + 1)}-${pad(end.getUTCDate())}`;
  return { startsOn, endsOn };
}

/** Année de la saison qui contient la date locale `isoDate`. */
export function seasonYearOf(isoDate: string, startMonth: number): number {
  const [y, m] = isoDate.split('-').map(Number);
  if (y === undefined || m === undefined || Number.isNaN(y) || Number.isNaN(m)) throw new RangeError(`Date invalide : ${isoDate}`);
  return m >= startMonth ? y : y - 1;
}

/** Mois de début conseillé selon l'hémisphère (RG-SEA-01). */
export function defaultSeasonStartMonth(lat: number): number {
  return lat < 0 ? 7 : 1;
}

export type AstronomicalSeason = 'spring' | 'summer' | 'autumn' | 'winter';

/** Saison astronomique approximative (équinoxes et solstices au 21), inversée dans l'hémisphère sud. */
export function astronomicalSeason(isoDate: string, lat: number): AstronomicalSeason {
  const [, m = 1, d = 1] = isoDate.split('-').map(Number);
  const md = m * 100 + d;
  const north: AstronomicalSeason = md >= 1221 || md < 320 ? 'winter' : md < 621 ? 'spring' : md < 922 ? 'summer' : 'autumn';
  if (lat >= 0) return north;
  const flip: Record<AstronomicalSeason, AstronomicalSeason> = { winter: 'summer', summer: 'winter', spring: 'autumn', autumn: 'spring' };
  return flip[north];
}
