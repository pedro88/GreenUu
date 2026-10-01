import { and, eq } from 'drizzle-orm';
import type { Executor } from '@/server/db/client';
import { season } from '@/server/db/schema';
import { seasonBounds } from './season.pure';

/** Crée la saison `year` si elle n'existe pas (RG-GRD-03) et la renvoie. */
export async function ensureSeason(
  tx: Executor,
  gardenId: string,
  year: number,
  startMonth: number,
  status: 'planned' | 'active' | 'closed',
) {
  const { startsOn, endsOn } = seasonBounds(year, startMonth);
  await tx.insert(season).values({ gardenId, year, startsOn, endsOn, status }).onConflictDoNothing();
  const [row] = await tx
    .select()
    .from(season)
    .where(and(eq(season.gardenId, gardenId), eq(season.year, year)))
    .limit(1);
  if (!row) throw new Error('Saison introuvable après création');
  return row;
}
