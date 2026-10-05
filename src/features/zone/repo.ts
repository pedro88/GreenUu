import { and, asc, eq, inArray, isNull, like, ne, or, sql } from 'drizzle-orm';
import { ROW_ZONE_TYPE } from '@/lib/enums';
import { notFound } from '@/lib/errors';
import type { Scope } from '@/server/authz/scope';
import type { ZoneRestriction } from '@/server/authz/zone-access';
import type { Executor } from '@/server/db/client';
import { zone, zoneGroupPermission, zoneType } from '@/server/db/schema';
import { ancestorIds, childPath } from './tree';

/** Dépôt scopé : toute requête est filtrée par le jardin du scope (SPEC §3.3). */

export type ZoneRow = typeof zone.$inferSelect;

export async function findZone(tx: Executor, scope: Scope, zoneId: string): Promise<ZoneRow> {
  const [z] = await tx.select().from(zone).where(and(eq(zone.gardenId, scope.gardenId), eq(zone.id, zoneId))).limit(1);
  if (!z) throw notFound('zoneNotFound');
  return z;
}

export async function listZones(tx: Executor, scope: Scope, opts: { includeArchived: boolean }) {
  return tx
    .select({
      id: zone.id,
      parentId: zone.parentId,
      name: zone.name,
      path: zone.path,
      depth: zone.depth,
      environment: zone.environment,
      geometry: zone.geometry,
      surfaceM2Manual: zone.surfaceM2Manual,
      lengthCm: zone.lengthCm,
      widthCm: zone.widthCm,
      sortOrder: zone.sortOrder,
      hasInterior: zone.hasInterior,
      archivedAt: zone.archivedAt,
      zoneTypeId: zone.zoneTypeId,
      typeCode: zoneType.code,
      typeLabel: zoneType.label,
      typeIsCustom: sql<boolean>`${zoneType.gardenId} is not null`,
      canHostCultures: zoneType.canHostCultures,
    })
    .from(zone)
    .innerJoin(zoneType, eq(zoneType.id, zone.zoneTypeId))
    .where(and(eq(zone.gardenId, scope.gardenId), opts.includeArchived ? undefined : isNull(zone.archivedAt)))
    .orderBy(asc(zone.depth), asc(zone.sortOrder), asc(zone.name));
}

export type ZoneListRow = Awaited<ReturnType<typeof listZones>>[number];

/** Descendants (tous niveaux) d'une zone, par préfixe de `path`. */
export async function findDescendants(tx: Executor, scope: Scope, z: { id: string; path: string }) {
  const prefix = childPath(z);
  return tx
    .select()
    .from(zone)
    .where(and(eq(zone.gardenId, scope.gardenId), or(eq(zone.path, prefix), like(zone.path, `${prefix}/%`))));
}

export async function findAncestors(tx: Executor, scope: Scope, z: { path: string }): Promise<ZoneRow[]> {
  const ids = ancestorIds(z.path);
  if (ids.length === 0) return [];
  const rows = await tx.select().from(zone).where(and(eq(zone.gardenId, scope.gardenId), inArray(zone.id, ids)));
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.flatMap((id) => byId.get(id) ?? []);
}

/** Restrictions de chaque zone de la chaîne racine → zone (pour `effectiveRestriction`). */
export async function restrictionChain(tx: Executor, scope: Scope, chainIds: string[]): Promise<ZoneRestriction[][]> {
  if (chainIds.length === 0) return [];
  const rows = await tx
    .select({ zoneId: zoneGroupPermission.zoneId, groupId: zoneGroupPermission.groupId, level: zoneGroupPermission.level })
    .from(zoneGroupPermission)
    .where(and(eq(zoneGroupPermission.gardenId, scope.gardenId), inArray(zoneGroupPermission.zoneId, chainIds)));
  return chainIds.map((id) => rows.filter((r) => r.zoneId === id).map(({ groupId, level }) => ({ groupId, level })));
}

/** Types de zone proposés dans ce jardin : types de base + types personnalisés du jardin. */
export async function listZoneTypes(tx: Executor, scope: Scope, opts: { includeArchived: boolean }) {
  return tx
    .select()
    .from(zoneType)
    .where(
      and(
        or(isNull(zoneType.gardenId), eq(zoneType.gardenId, scope.gardenId)),
        opts.includeArchived ? undefined : isNull(zoneType.archivedAt),
      ),
    )
    .orderBy(asc(zoneType.sortOrder), asc(zoneType.label));
}

export async function findUsableZoneType(tx: Executor, scope: Scope, zoneTypeId: string) {
  const [t] = await tx
    .select()
    .from(zoneType)
    .where(
      and(
        eq(zoneType.id, zoneTypeId),
        or(isNull(zoneType.gardenId), eq(zoneType.gardenId, scope.gardenId)),
        isNull(zoneType.archivedAt),
      ),
    )
    .limit(1);
  if (!t) throw notFound('zoneTypeNotFound');
  return t;
}

/** Zones sœurs actives dessinées dans la même scène (pour RG-ZON-05). */
/** Géométries des zones sœurs (ou des enfants) ; les rangs n'en ont pas de propre : ils découpent leur planche. */
export async function siblingGeometries(tx: Executor, scope: Scope, parentId: string | null, excludeId: string | null) {
  const rows = await tx
    .select({ id: zone.id, geometry: zone.geometry })
    .from(zone)
    .innerJoin(zoneType, eq(zoneType.id, zone.zoneTypeId))
    .where(
      and(
        eq(zone.gardenId, scope.gardenId),
        parentId === null ? isNull(zone.parentId) : eq(zone.parentId, parentId),
        isNull(zone.archivedAt),
        ne(zoneType.code, ROW_ZONE_TYPE),
      ),
    );
  return rows.filter((r) => r.id !== excludeId && r.geometry !== null).flatMap((r) => (r.geometry ? [r.geometry] : []));
}

/** Code du type d'une zone. */
export async function zoneTypeCode(tx: Executor, zoneTypeId: string): Promise<string | null> {
  const [t] = await tx.select({ code: zoneType.code }).from(zoneType).where(eq(zoneType.id, zoneTypeId)).limit(1);
  return t?.code ?? null;
}
