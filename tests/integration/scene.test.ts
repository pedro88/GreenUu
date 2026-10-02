import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createCulture } from '../../src/features/culture/service';
import { applyPlanCommands } from '../../src/features/scene/plan';
import { replay, type EditorScene, type ZoneTypeInfo } from '../../src/features/scene/plan.pure';
import { applyPlanSchema, planCommandSchema, type PlanCommand } from '../../src/features/scene/plan.schema';
import { sceneSnapshot } from '../../src/features/scene/snapshot';
import { createTicket } from '../../src/features/ticket/commands';
import { garden, zone } from '../../src/server/db/schema';
import type { Tx } from '../../src/server/db/client';
import type { Actor } from '../../src/server/action-core';
import { addMember, makeGarden, makeZone, speciesRefId, zoneTypeId } from './fixtures';
import { inTx, makeUser, NOW, scopedCtx } from './helpers';

const rect = (x: number, y: number, w: number, h: number) => ({ v: 1 as const, kind: 'rect' as const, x, y, w, h });

async function plannedGarden(tx: Tx, owner: Actor) {
  const gardenId = await makeGarden(tx, owner);
  const potager = await makeZone(tx, owner, gardenId, 'Potager', 'plot', null, rect(0, 0, 1000, 600));
  const ctx = await scopedCtx(tx, owner, gardenId);
  return { gardenId, potager, ctx, bed: await zoneTypeId(tx, 'bed') };
}

const version = async (tx: Tx, gardenId: string) => (await tx.select({ v: garden.planVersion }).from(garden).where(eq(garden.id, gardenId)))[0]?.v ?? -1;
const create = (clientId: string, zoneTypeId: string, parentId: string, g: ReturnType<typeof rect>): PlanCommand =>
  planCommandSchema.parse({ op: 'createZone', clientId: `tmp:${clientId}`, name: clientId, zoneTypeId, parentId, geometry: g });

describe('instantané de scène (§9.1, §9.4)', () => {
  it('[MAP-04] une culture avec un ticket d\'arrosage en retard sur sa zone est thirsty', () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const { gardenId, potager, ctx } = await plannedGarden(tx, alice);
      const planche = await makeZone(tx, alice, gardenId, 'Planche 1', 'bed', potager, rect(100, 100, 200, 300));
      const { cultureId } = await createCulture(ctx, { gardenId, zoneId: planche, speciesId: speciesRefId('tomate'), method: 'bought_plants', anchorDate: '2026-05-10', seedSource: 'bought', plannedDates: {}, acknowledgeRotation: true });
      await createTicket(ctx, { gardenId, type: 'task', title: 'Arroser le potager', priority: 'normal', checklist: [], memberIds: [], groupIds: [], zoneId: potager, actionTag: 'watering', dueOn: '2026-06-10' });
      const snap = await sceneSnapshot(tx, ctx.scope, { userId: alice.id, sceneZoneId: null, now: NOW });
      const c = snap.cultures.find((x) => x.id === cultureId);
      expect(c?.states).toContain('thirsty');
      // Placée dans sa planche, avec la chaîne de repli des sprites.
      expect(c?.position).toEqual(expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }));
      expect(c?.spriteKeys).toEqual(['tomate', 'family:solanaceae']);
      expect(snap.zones.map((z) => z.name).sort()).toEqual(['Planche 1', 'Potager']);
    }));
});

describe('éditeur de plan (§9.7)', () => {
  it('[PLN-04] un lot de 3 commandes dont la 3e viole RG-ZON-05 n\'applique rien (tout ou rien)', () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const { gardenId, potager, ctx, bed } = await plannedGarden(tx, alice);
      const before = await version(tx, gardenId);
      await expect(applyPlanCommands(ctx, { gardenId, sceneZoneId: null, baseVersion: before, commands: [
        create('a', bed, potager, rect(0, 0, 200, 200)),
        create('b', bed, potager, rect(300, 0, 200, 200)),
        create('c', bed, potager, rect(900, 0, 200, 200)), // dépasse du Potager
      ] })).rejects.toMatchObject({ code: 'VALIDATION' });
      expect(await tx.select().from(zone).where(and(eq(zone.gardenId, gardenId), eq(zone.parentId, potager)))).toHaveLength(0);
      expect(await version(tx, gardenId)).toBe(before);
    }));

  it('[PLN-03] A enregistre sur la version 7, B reçoit CONFLICT, recharge, rejoue et signale ses conflits', () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const { gardenId, potager, ctx, bed } = await plannedGarden(tx, alice);
      await tx.update(garden).set({ planVersion: 7 }).where(eq(garden.id, gardenId));
      const a = await applyPlanCommands(ctx, { gardenId, sceneZoneId: null, baseVersion: 7, commands: [create('a', bed, potager, rect(0, 0, 200, 200))] });
      expect(a.planVersion).toBe(8);
      const mine = [create('b1', bed, potager, rect(100, 100, 200, 200)), create('b2', bed, potager, rect(500, 0, 200, 200))];
      await expect(applyPlanCommands(ctx, { gardenId, sceneZoneId: null, baseVersion: 7, commands: mine })).rejects.toMatchObject({ code: 'CONFLICT' });
      // Le client recharge l'instantané et rejoue ses commandes non confirmées.
      const snap = await sceneSnapshot(tx, ctx.scope, { userId: alice.id, sceneZoneId: null, now: NOW });
      const types = new Map<string, ZoneTypeInfo>([[bed, { id: bed, code: 'bed', label: 'Planche', canHostCultures: true, hasInteriorDefault: false }]]);
      const scene: EditorScene = { tileSizeCm: snap.tileSizeCm, zones: snap.zones, terrain: snap.terrain, decor: snap.decor };
      const r = replay(scene, mine, types);
      expect(r.conflicts.map((c) => c.issue)).toEqual(['overlaps_sibling']);
      const b = await applyPlanCommands(ctx, { gardenId, sceneZoneId: null, baseVersion: snap.planVersion, commands: r.kept });
      expect(b.planVersion).toBe(9);
      expect(Object.keys(b.ids)).toEqual(['tmp:b2']);
    }));

  it('une géométrie négative ou démesurée est refusée par le schéma des commandes', () => {
    for (const geometry of [rect(-50, 0, 100, 100), rect(0, 0, 2_000_000, 100)]) {
      expect(applyPlanSchema.safeParse({ gardenId: crypto.randomUUID(), sceneZoneId: null, baseVersion: 0, commands: [{ op: 'moveZone', zoneId: crypto.randomUUID(), geometry }] }).success).toBe(false);
      expect(applyPlanSchema.safeParse({ gardenId: crypto.randomUUID(), sceneZoneId: null, baseVersion: 0, commands: [{ op: 'addTerrain', clientId: 'tmp:a', kind: 'path', geometry }] }).success).toBe(false);
    }
    expect(applyPlanSchema.safeParse({ gardenId: crypto.randomUUID(), sceneZoneId: null, baseVersion: 0, commands: [{ op: 'moveZone', zoneId: crypto.randomUUID(), geometry: rect(0, 0, 100, 100) }] }).success).toBe(true);
  });

  it('[PLN-08] la gomme sur une zone qui a un historique l\'archive, sans la supprimer', () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const { gardenId, potager, ctx } = await plannedGarden(tx, alice);
      const planche = await makeZone(tx, alice, gardenId, 'Planche 1', 'bed', potager, rect(100, 100, 200, 300));
      await createCulture(ctx, { gardenId, zoneId: planche, speciesId: speciesRefId('tomate'), method: 'bought_plants', anchorDate: '2026-05-10', seedSource: 'bought', plannedDates: {}, acknowledgeRotation: true });
      const v = await version(tx, gardenId);
      // Sans confirmation, une zone qui porte une culture en cours n'est pas archivée.
      await expect(applyPlanCommands(ctx, { gardenId, sceneZoneId: null, baseVersion: v, commands: [{ op: 'archiveZone', zoneId: planche, finishActiveCultures: false }] }))
        .rejects.toMatchObject({ code: 'CONFLICT' });
      await applyPlanCommands(ctx, { gardenId, sceneZoneId: null, baseVersion: v, commands: [{ op: 'archiveZone', zoneId: planche, finishActiveCultures: true }] });
      const [row] = await tx.select({ archivedAt: zone.archivedAt }).from(zone).where(eq(zone.id, planche));
      expect(row?.archivedAt).not.toBeNull();
    }));

  it('[PLN-06] terrain et échelle exigent plan:edit : l\'appel direct d\'un membre d\'un jardin collectif renvoie FORBIDDEN', () =>
    inTx(async (tx) => {
      const bruno = await makeUser(tx);
      const david = await makeUser(tx);
      const gardenId = await makeGarden(tx, bruno, { orgType: 'collective' });
      await addMember(tx, gardenId, david, 'member');
      await tx.update(garden).set({ planEditMinRole: 'admin' }).where(eq(garden.id, gardenId));
      const asDavid = await scopedCtx(tx, david, gardenId);
      await expect(applyPlanCommands(asDavid, { gardenId, sceneZoneId: null, baseVersion: 0, commands: [{ op: 'setScale', tileSizeCm: 25 }] })).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(applyPlanCommands(asDavid, { gardenId, sceneZoneId: null, baseVersion: 0, commands: [{ op: 'addTerrain', clientId: 'tmp:allee', kind: 'path', geometry: rect(0, 0, 100, 50) }] })).rejects.toMatchObject({ code: 'FORBIDDEN' });
      const asBruno = await scopedCtx(tx, bruno, gardenId);
      const r = await applyPlanCommands(asBruno, { gardenId, sceneZoneId: null, baseVersion: 0, commands: [{ op: 'addTerrain', clientId: 'tmp:allee', kind: 'path', geometry: rect(0, 0, 100, 50) }, { op: 'setScale', tileSizeCm: 25 }] });
      expect(r.planVersion).toBe(1);
      expect((await tx.select({ t: garden.tileSizeCm }).from(garden).where(eq(garden.id, gardenId)))[0]?.t).toBe(25);
    }));
});
