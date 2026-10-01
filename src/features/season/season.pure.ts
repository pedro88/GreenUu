/** Saisons culturales (RG-SEA-01). Dates au format ISO `YYYY-MM-DD`. */

const pad = (n: number) => String(n).padStart(2, '0');

/** Bornes de la saison `year` pour un jardin dont la saison commence au mois `startMonth` (1–12). */
export function seasonBounds(year: number, startMonth: number): { startsOn: string; endsOn: string } {
  const startsOn = `${year}-${pad(startMonth)}-01`;
  const end = new Date(Date.UTC(startMonth === 1 ? year : year + 1, startMonth - 1, 0));
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
