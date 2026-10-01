import { and, eq, isNull } from 'drizzle-orm';
import type { Actor } from '../../src/server/action-core';
import type { Tx } from '../../src/server/db/client';
import { gardenGroup, gardenMember, groupMember } from '../../src/server/db/schema';
import { createGarden } from '../../src/features/garden/service';
import type { GardenRole, OrgType } from '../../src/lib/enums';
import { ctxFor } from './helpers';

export async function makeGarden(tx: Tx, owner: Actor, opts: { orgType?: OrgType; name?: string } = {}) {
  const { gardenId } = await createGarden(ctxFor(tx, owner), {
    name: opts.name ?? 'Les Tilleuls', orgType: opts.orgType ?? 'family', environments: ['open_air'],
    lat: 50.85, lng: 4.35, timezone: 'Europe/Brussels', soilType: 'loam',
  });
  return gardenId;
}

export async function addMember(tx: Tx, gardenId: string, actor: Actor, role: Exclude<GardenRole, 'owner'>) {
  const [m] = await tx.insert(gardenMember).values({ gardenId, userId: actor.id, role }).returning({ id: gardenMember.id });
  if (!m) throw new Error('member');
  return m.id;
}

export async function memberIdOf(tx: Tx, gardenId: string, userId: string) {
  const [m] = await tx.select({ id: gardenMember.id }).from(gardenMember)
    .where(and(eq(gardenMember.gardenId, gardenId), eq(gardenMember.userId, userId), isNull(gardenMember.leftAt))).limit(1);
  if (!m) throw new Error('not a member');
  return m.id;
}

export async function makeGroup(tx: Tx, gardenId: string, name: string, memberIds: string[]) {
  const [g] = await tx.insert(gardenGroup).values({ gardenId, name }).returning({ id: gardenGroup.id });
  if (!g) throw new Error('group');
  if (memberIds.length) await tx.insert(groupMember).values(memberIds.map((memberId) => ({ gardenId, groupId: g.id, memberId })));
  return g.id;
}

import { zoneType } from '../../src/server/db/schema';
import { createZone } from '../../src/features/zone/service';
import { speciesRefId, varietyRefId } from '../../src/features/plant/reference/load';
import { scopedCtx } from './helpers';

export { speciesRefId, varietyRefId };

export async function zoneTypeId(tx: Tx, code: string) {
  const [t] = await tx.select().from(zoneType).where(and(eq(zoneType.code, code), isNull(zoneType.gardenId))).limit(1);
  if (!t) throw new Error(code);
  return t.id;
}

export async function makeZone(tx: Tx, owner: Actor, gardenId: string, name: string, code = 'bed', parentId: string | null = null, geometry: { v: 1; kind: 'rect'; x: number; y: number; w: number; h: number } | null = null) {
  const ctx = await scopedCtx(tx, owner, gardenId);
  const { zoneId } = await createZone(ctx, { gardenId, parentId, name, zoneTypeId: await zoneTypeId(tx, code), environment: null, geometry, hasInterior: false });
  return zoneId;
}
