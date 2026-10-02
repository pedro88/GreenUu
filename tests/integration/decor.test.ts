import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { applyPlanCommands } from '../../src/features/scene/plan';
import { planCommandSchema, type PlanCommandInput } from '../../src/features/scene/plan.schema';
import { sceneSnapshot } from '../../src/features/scene/snapshot';
import { declareDecorPractice } from '../../src/features/decor/service';
import { createTicket } from '../../src/features/ticket/commands';
import { fixedClock } from '../../src/server/clock';
import { culture, decorPlacement, garden, practice, practiceDeclaration, userProgress, zone } from '../../src/server/db/schema';
import type { Tx } from '../../src/server/db/client';
import type { Actor } from '../../src/server/action-core';
import { addMember, makeGarden, makeZone } from './fixtures';
import { inTx, makeUser, NOW, scopedCtx } from './helpers';

const rect = (x: number, y: number, w: number, h: number) => ({ v: 1 as const, kind: 'rect' as const, x, y, w, h });
const cmd = (c: PlanCommandInput) => planCommandSchema.parse(c);
const version = async (tx: Tx, gardenId: string) => (await tx.select({ v: garden.planVersion }).from(garden).where(eq(garden.id, gardenId)))[0]?.v ?? -1;

async function setup(tx: Tx, owner: Actor, orgType: 'family' | 'collective' = 'family') {
  const gardenId = await makeGarden(tx, owner, { orgType });
  const potager = await makeZone(tx, owner, gardenId, 'Potager', 'plot', null, rect(0, 0, 1000, 600));
  return { gardenId, potager, ctx: await scopedCtx(tx, owner, gardenId) };
}

describe('décoration (§9.7, §4.2.6)', () => {
  it('[DEC-01] un objet débloqué placé sur la grille crée un decor_placement, sans toucher aux cultures ni aux zones', () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const { gardenId, potager, ctx } = await setup(tx, alice);
      const zonesBefore = await tx.select().from(zone).where(eq(zone.gardenId, gardenId));
      const culturesBefore = await tx.select().from(culture).where(eq(culture.gardenId, gardenId));
      const r = await applyPlanCommands(ctx, { gardenId, sceneZoneId: null, baseVersion: await version(tx, gardenId), commands: [cmd({ op: 'placeDecor', clientId: 'tmp:banc', itemCode: 'bench', x: 250, y: 300 })] });
      const id = r.ids['tmp:banc'] ?? '';
      const [p] = await tx.select().from(decorPlacement).where(eq(decorPlacement.id, id));
      expect(p).toMatchObject({ gardenId, sceneZoneId: null, xCm: 250, yCm: 300, placedBy: alice.id });
      // Posé au milieu du Potager : aucune zone ni culture n'est modifiée.
      expect(await tx.select().from(zone).where(eq(zone.gardenId, gardenId))).toEqual(zonesBefore);
      expect(await tx.select().from(culture).where(eq(culture.gardenId, gardenId))).toEqual(culturesBefore);
      const snap = await sceneSnapshot(tx, ctx.scope, { userId: alice.id, sceneZoneId: null, now: NOW });
      expect(snap.decor).toEqual([expect.objectContaining({ id, itemCode: 'bench', x: 250, y: 300 })]);
      expect(snap.zones.find((z) => z.id === potager)?.geometry).toEqual(rect(0, 0, 1000, 600));
      // Déplacer puis retirer : l'objet n'a pas d'historique.
      await applyPlanCommands(ctx, { gardenId, sceneZoneId: null, baseVersion: r.planVersion, commands: [cmd({ op: 'moveDecor', decorId: id, x: 400, y: 300 }), cmd({ op: 'removeDecor', decorId: id })] });
      expect(await tx.select().from(decorPlacement).where(eq(decorPlacement.id, id))).toHaveLength(0);
    }));

  it('[DEC-02] une commande placeDecor forgée pour un objet de niveau 5, par un utilisateur de niveau 3, donne LOCKED_ITEM', () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const { gardenId, ctx } = await setup(tx, alice);
      await tx.insert(userProgress).values({ userId: alice.id, totalXp: 300, level: 3 });
      const v = await version(tx, gardenId);
      await expect(applyPlanCommands(ctx, { gardenId, sceneZoneId: null, baseVersion: v, commands: [
        cmd({ op: 'placeDecor', clientId: 'tmp:ok', itemCode: 'bench', x: 50, y: 50 }),
        cmd({ op: 'placeDecor', clientId: 'tmp:statue', itemCode: 'statue', x: 100, y: 100 }),
      ] })).rejects.toMatchObject({ code: 'LOCKED_ITEM' });
      // Tout ou rien : le banc du même lot n'est pas posé non plus.
      expect(await tx.select().from(decorPlacement).where(eq(decorPlacement.gardenId, gardenId))).toHaveLength(0);
      expect(await version(tx, gardenId)).toBe(v);
      await tx.update(userProgress).set({ level: 5, totalXp: 1000 }).where(eq(userProgress.userId, alice.id));
      await applyPlanCommands(ctx, { gardenId, sceneZoneId: null, baseVersion: v, commands: [cmd({ op: 'placeDecor', clientId: 'tmp:statue', itemCode: 'statue', x: 100, y: 100 })] });
      expect(await tx.select().from(decorPlacement).where(eq(decorPlacement.gardenId, gardenId))).toHaveLength(1);
    }));

  it('un observateur ne peut pas placer de déco ; un membre le peut même sans plan:edit', () =>
    inTx(async (tx) => {
      const bruno = await makeUser(tx);
      const { gardenId } = await setup(tx, bruno, 'collective');
      const farid = await makeUser(tx);
      const david = await makeUser(tx);
      await addMember(tx, gardenId, farid, 'observer');
      await addMember(tx, gardenId, david, 'member');
      const place = cmd({ op: 'placeDecor', clientId: 'tmp:n', itemCode: 'birdhouse', x: 50, y: 50 });
      await expect(applyPlanCommands(await scopedCtx(tx, farid, gardenId), { gardenId, sceneZoneId: null, baseVersion: await version(tx, gardenId), commands: [place] })).rejects.toMatchObject({ code: 'FORBIDDEN' });
      const dc = await scopedCtx(tx, david, gardenId);
      expect(dc.scope.role).toBe('member');
      await applyPlanCommands(dc, { gardenId, sceneZoneId: null, baseVersion: await version(tx, gardenId), commands: [place] });
      // Mais pas de terrain (plan:edit réservé aux admins dans un jardin collectif).
      await expect(applyPlanCommands(dc, { gardenId, sceneZoneId: null, baseVersion: await version(tx, gardenId), commands: [cmd({ op: 'addTerrain', clientId: 'tmp:t', kind: 'path', geometry: rect(0, 0, 100, 100) })] })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    }));

  it('[DEC-03] un hôtel à insectes déclaré comme pratique crée la déclaration liée ; le retirer propose de retirer la pratique', () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const { gardenId, ctx } = await setup(tx, alice);
      const r = await applyPlanCommands(ctx, { gardenId, sceneZoneId: null, baseVersion: await version(tx, gardenId), commands: [
        cmd({ op: 'placeDecor', clientId: 'tmp:h1', itemCode: 'insect_hotel', x: 100, y: 100 }),
        cmd({ op: 'placeDecor', clientId: 'tmp:h2', itemCode: 'birdhouse', x: 300, y: 100 }),
      ] });
      const hotel = r.ids['tmp:h1'] ?? '';
      const nest = r.ids['tmp:h2'] ?? '';
      await declareDecorPractice(ctx, hotel);
      const [pr] = await tx.select({ id: practice.id }).from(practice).where(eq(practice.code, 'biodiversity_insect_hotel'));
      const linked = await tx.select().from(practiceDeclaration).where(and(eq(practiceDeclaration.gardenId, gardenId), eq(practiceDeclaration.decorPlacementId, hotel)));
      expect(linked).toEqual([expect.objectContaining({ practiceId: pr?.id, zoneId: null, seasonId: null, excluded: false })]);
      // L'instantané signale la pratique déclarée : c'est ce qui fait proposer son retrait avec l'objet.
      let snap = await sceneSnapshot(tx, ctx.scope, { userId: alice.id, sceneZoneId: null, now: NOW });
      expect(snap.decor.find((d) => d.id === hotel)).toMatchObject({ practiceCode: 'biodiversity_insect_hotel', practiceDeclared: true });
      expect(snap.decor.find((d) => d.id === nest)).toMatchObject({ practiceCode: 'biodiversity_birdhouse', practiceDeclared: false });
      // Un objet sans pratique ne se déclare pas.
      const b = await applyPlanCommands(ctx, { gardenId, sceneZoneId: null, baseVersion: snap.planVersion, commands: [cmd({ op: 'placeDecor', clientId: 'tmp:b', itemCode: 'bench', x: 500, y: 100 })] });
      await expect(declareDecorPractice(ctx, b.ids['tmp:b'] ?? '')).rejects.toMatchObject({ code: 'VALIDATION' });
      // Retirer l'objet en retirant la pratique.
      await applyPlanCommands(ctx, { gardenId, sceneZoneId: null, baseVersion: b.planVersion, commands: [cmd({ op: 'removeDecor', decorId: hotel, removePractice: true })] });
      expect(await tx.select().from(practiceDeclaration).where(and(eq(practiceDeclaration.gardenId, gardenId), eq(practiceDeclaration.practiceId, pr?.id ?? '')))).toHaveLength(0);
      // Retirer l'objet en gardant la pratique : la déclaration reste, détachée de l'objet.
      await declareDecorPractice(ctx, nest);
      snap = await sceneSnapshot(tx, ctx.scope, { userId: alice.id, sceneZoneId: null, now: NOW });
      await applyPlanCommands(ctx, { gardenId, sceneZoneId: null, baseVersion: snap.planVersion, commands: [cmd({ op: 'removeDecor', decorId: nest, removePractice: false })] });
      const kept = await tx.select().from(practiceDeclaration).innerJoin(practice, eq(practice.id, practiceDeclaration.practiceId))
        .where(and(eq(practiceDeclaration.gardenId, gardenId), eq(practice.code, 'biodiversity_birdhouse')));
      expect(kept).toHaveLength(1);
      expect(kept[0]?.practice_declaration.decorPlacementId).toBeNull();
    }));
});

describe('avatars dans la vue (§9.5)', () => {
  it('seuls les membres actifs dans les 24 dernières heures apparaissent, près de la zone de leur dernière action', () =>
    inTx(async (tx) => {
      const bruno = await makeUser(tx, { pseudo: `bruno${Date.now().toString(36)}` });
      const { gardenId, potager } = await setup(tx, bruno, 'collective');
      const serre = await makeZone(tx, bruno, gardenId, 'Serre', 'plot', null, rect(1200, 0, 400, 300));
      const emma = await makeUser(tx);
      const david = await makeUser(tx);
      await addMember(tx, gardenId, emma, 'member');
      await addMember(tx, gardenId, david, 'member');
      const base = { gardenId, type: 'task' as const, priority: 'normal' as const, checklist: [], memberIds: [], groupIds: [] };
      // Emma agit d'abord sur le Potager, puis sur la Serre : c'est sa dernière action qui compte.
      await createTicket(await scopedCtx(tx, emma, gardenId, { clock: fixedClock(new Date(NOW.getTime() - 3 * 3_600_000)) }), { ...base, title: 'Désherber', zoneId: potager });
      await createTicket(await scopedCtx(tx, emma, gardenId, { clock: fixedClock(new Date(NOW.getTime() - 3_600_000)) }), { ...base, title: 'Aérer', zoneId: serre });
      // David n'a pas agi depuis deux jours.
      await createTicket(await scopedCtx(tx, david, gardenId, { clock: fixedClock(new Date(NOW.getTime() - 48 * 3_600_000)) }), { ...base, title: 'Tailler', zoneId: potager });
      const snap = await sceneSnapshot(tx, (await scopedCtx(tx, bruno, gardenId)).scope, { userId: bruno.id, sceneZoneId: null, now: NOW });
      const users = snap.avatars.map((a) => a.userId);
      expect(users).toContain(emma.id);
      expect(users).not.toContain(david.id);
      const e = snap.avatars.find((a) => a.userId === emma.id);
      expect(e?.zoneId).toBe(serre);
      // Au pied de la Serre.
      expect(e?.position.y).toBe(300);
      expect(e?.position.x).toBeGreaterThan(1200);
      expect(e?.position.x).toBeLessThan(1600);
      // Un jardin familial n'affiche pas d'avatars.
      const alice = await makeUser(tx);
      const fam = await setup(tx, alice, 'family');
      await createTicket(fam.ctx, { ...base, gardenId: fam.gardenId, title: 'Arroser', zoneId: fam.potager });
      expect((await sceneSnapshot(tx, fam.ctx.scope, { userId: alice.id, sceneZoneId: null, now: NOW })).avatars).toEqual([]);
    }));
});
