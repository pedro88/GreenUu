import { localDate } from '@/lib/dates';
import { astronomicalSeason, type AstronomicalSeason } from '../progression/quests.pure';

/* Cycle jour / nuit et saison (SPEC §9.1) : filtre de couleur global, sans asset dédié. */

export type DayPeriod = 'night' | 'dawn' | 'day' | 'dusk';
export type AmbientFilter = { period: DayPeriod; season: AstronomicalSeason; tint: number; alpha: number; elevationDeg: number };

const RAD = Math.PI / 180;
const norm360 = (x: number) => ((x % 360) + 360) % 360;

/**
 * Élévation du soleil en degrés (approximation NOAA / almanach, précise à moins d'un degré), pour un instant et une position.
 * Renvoie aussi l'angle horaire, négatif le matin.
 */
export function solarPosition(at: Date, lat: number, lng: number): { elevationDeg: number; hourAngleDeg: number } {
  const n = at.getTime() / 86_400_000 + 2440587.5 - 2451545.0;
  const L = norm360(280.46 + 0.9856474 * n);
  const g = norm360(357.528 + 0.9856003 * n) * RAD;
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  const eps = (23.439 - 0.0000004 * n) * RAD;
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda)) / RAD;
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const gmst = norm360(280.46061837 + 360.98564736629 * n);
  let h = norm360(gmst + lng - ra);
  if (h > 180) h -= 360;
  const elevation = Math.asin(Math.sin(lat * RAD) * Math.sin(dec) + Math.cos(lat * RAD) * Math.cos(dec) * Math.cos(h * RAD)) / RAD;
  return { elevationDeg: elevation, hourAngleDeg: h };
}

/** Teinte et opacité du filtre selon le moment de la journée. */
const TINTS: Record<DayPeriod, { tint: number; alpha: number }> = {
  night: { tint: 0x26305e, alpha: 0.42 },
  dawn: { tint: 0xffb27a, alpha: 0.16 },
  day: { tint: 0xffffff, alpha: 0 },
  dusk: { tint: 0xff8a5c, alpha: 0.22 },
};

/** Filtre ambiant d'un jardin à un instant : nuit sous −6° (crépuscule civil), aube ou soir entre −6° et 6°, jour au-dessus. */
export function ambientFilter(at: Date, garden: { lat: number; lng: number; timezone: string }): AmbientFilter {
  const { elevationDeg, hourAngleDeg } = solarPosition(at, garden.lat, garden.lng);
  const period: DayPeriod = elevationDeg < -6 ? 'night' : elevationDeg < 6 ? (hourAngleDeg < 0 ? 'dawn' : 'dusk') : 'day';
  const season = astronomicalSeason(localDate(at, garden.timezone), garden.lat < 0);
  return { period, season, ...TINTS[period], elevationDeg: Math.round(elevationDeg * 10) / 10 };
}
