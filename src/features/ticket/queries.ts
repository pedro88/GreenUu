import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { Scope } from '@/server/authz/scope';
import type { Executor } from '@/server/db/client';
import { culture, species, variety, zone } from '@/server/db/schema';

/** Cultures en cours (sélecteur de rattachement d'un ticket). */
export async function runningCultures(tx: Executor, scope: Scope) {
  return tx.select({ id: culture.id, label: sql<string>`concat_ws(' ', ${species.commonNames}->'fr'->>0, ${variety.name}, '— ' || ${zone.name})` }).from(culture)
    .innerJoin(species, eq(species.id, culture.speciesId)).leftJoin(variety, eq(variety.id, culture.varietyId)).innerJoin(zone, eq(zone.id, culture.zoneId))
    .where(and(eq(culture.gardenId, scope.gardenId), isNull(culture.deletedAt), inArray(culture.status, ['planned', 'active'])))
    .orderBy(asc(zone.name)).limit(300);
}
