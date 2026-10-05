import { and, eq } from 'drizzle-orm';
import { localDate } from '@/lib/dates';
import type { Scope } from '@/server/authz/scope';
import type { Executor } from '@/server/db/client';
import { garden, season } from '@/server/db/schema';
import { astronomicalSeason, seasonYearOf } from './season.pure';

/** Saison culturale courante et saison astronomique (badge « Automne 2026 » des maquettes). */
export async function currentSeasonLabel(tx: Executor, scope: Scope, now: Date, timezone: string) {
  const [g] = await tx.select({ startMonth: garden.seasonStartMonth, lat: garden.lat }).from(garden).where(eq(garden.id, scope.gardenId)).limit(1);
  if (!g) return null;
  const today = localDate(now, timezone);
  const year = seasonYearOf(today, g.startMonth);
  const [s] = await tx.select({ year: season.year }).from(season).where(and(eq(season.gardenId, scope.gardenId), eq(season.year, year))).limit(1);
  return { year: s?.year ?? year, astronomical: astronomicalSeason(today, g.lat < 0) };
}
