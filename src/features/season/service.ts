import { and, eq } from 'drizzle-orm';
import { forbidden, notFound } from '@/lib/errors';
import type { ScopedCtx } from '@/server/action-core';
import { can } from '@/server/authz/scope';
import { emit } from '@/server/events/emit';
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

/** Clôture / réouverture manuelle d'une saison (RG-SEA-02) : owner ou admin. */
export async function setSeasonClosed(ctx: ScopedCtx, year: number, closed: boolean) {
  const { tx, scope, actor, clock } = ctx;
  if (!can(scope, 'garden:update')) throw forbidden();
  const [s] = await tx.update(season).set({ status: closed ? 'closed' : 'active' }).where(and(eq(season.gardenId, scope.gardenId), eq(season.year, year))).returning({ id: season.id });
  if (!s) throw notFound();
  await emit(tx, { type: closed ? 'season.closed' : 'season.reopened', subjectType: 'season', subjectId: s.id, gardenId: scope.gardenId, actorId: actor.id, payload: { year } }, clock.now());
  return { seasonId: s.id };
}

export async function listSeasons(tx: Executor, gardenId: string) {
  return tx.select().from(season).where(eq(season.gardenId, gardenId)).orderBy(season.year);
}
