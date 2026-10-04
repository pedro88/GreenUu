import { and, eq, isNotNull } from 'drizzle-orm';
import { localDate } from '@/lib/dates';
import type { Executor } from '@/server/db/client';
import { decorItem, decorPlacement, garden, planSnapshot, terrainCell, zone, zoneType } from '@/server/db/schema';
import { planSnapshotV1Schema, type PlanSnapshotV1 } from './history.schema';

/*
 * Instantanés du plan (SPEC §4.2.6, TLP-01) : à chaque modification du plan, l'état complet du plan du jardin est écrit
 * dans la même transaction, une ligne par jour local du jardin (la dernière version du jour remplace les précédentes).
 * Un lot de l'éditeur n'écrit qu'un instantané, à la fin : les services de zone appelés pendant le lot le savent par
 * la transaction du lot, marquée ici.
 */

const batches = new WeakSet<Executor>();

/** Marque la transaction d'un lot de l'éditeur : les modifications de zone n'y écrivent pas d'instantané chacune. */
export function markPlanBatch(tx: Executor): void {
  batches.add(tx);
}

/** Modification du plan hors lot (formulaire de zone, archivage…) : instantané du jour. */
export async function planChanged(tx: Executor, gardenId: string, now: Date): Promise<void> {
  if (!batches.has(tx)) await recordPlanSnapshot(tx, gardenId, now);
}

export async function recordPlanSnapshot(tx: Executor, gardenId: string, now: Date): Promise<void> {
  const [g] = await tx.select({ timezone: garden.timezone, tileSizeCm: garden.tileSizeCm, planVersion: garden.planVersion }).from(garden).where(eq(garden.id, gardenId)).limit(1);
  if (!g) return;
  const zones = await tx.select({
    id: zone.id, name: zone.name, typeCode: zoneType.code, parentId: zone.parentId, sceneZoneId: zone.sceneZoneId, geometry: zone.geometry, archivedAt: zone.archivedAt,
  }).from(zone).innerJoin(zoneType, eq(zoneType.id, zone.zoneTypeId)).where(and(eq(zone.gardenId, gardenId), isNotNull(zone.geometry))).orderBy(zone.id);
  const cells = await tx.select({ sceneZoneId: terrainCell.sceneZoneId, kind: terrainCell.kind, x: terrainCell.x, y: terrainCell.y }).from(terrainCell)
    .where(eq(terrainCell.gardenId, gardenId)).orderBy(terrainCell.sceneZoneId, terrainCell.kind, terrainCell.y, terrainCell.x);
  const objects = await tx.select({ id: decorPlacement.id, sceneZoneId: decorPlacement.sceneZoneId, itemCode: decorItem.code, x: decorPlacement.xCm, y: decorPlacement.yCm, label: decorPlacement.label })
    .from(decorPlacement).innerJoin(decorItem, eq(decorItem.id, decorPlacement.decorItemId)).where(eq(decorPlacement.gardenId, gardenId)).orderBy(decorPlacement.id);
  const groups = new Map<string, PlanSnapshotV1['terrain'][number]>();
  for (const c of cells) {
    const key = `${c.sceneZoneId ?? ''}|${c.kind}`;
    const group = groups.get(key) ?? { sceneZoneId: c.sceneZoneId, kind: c.kind, cells: [] };
    group.cells.push([c.x, c.y]);
    groups.set(key, group);
  }
  const payload = planSnapshotV1Schema.parse({
    v: 1, tileSizeCm: g.tileSizeCm, zones: zones.map((z) => ({ ...z, archivedAt: z.archivedAt?.toISOString() ?? null })), terrain: [...groups.values()], objects,
  });
  const takenOn = localDate(now, g.timezone);
  await tx.insert(planSnapshot).values({ gardenId, takenOn, planVersion: g.planVersion, payload })
    .onConflictDoUpdate({ target: [planSnapshot.gardenId, planSnapshot.takenOn], set: { planVersion: g.planVersion, payload } });
}
