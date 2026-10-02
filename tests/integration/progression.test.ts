import { and, eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createCulture, deleteCulture, recordStage } from '../../src/features/culture/service';
import { recordHarvest } from '../../src/features/harvest/service';
import { createGoal, goalsOf, leaderboard, setLeaderboard, setLeaderboardOptOut } from '../../src/features/progression/collective';
import { generateQuests } from '../../src/features/progression/quests';
import { progressOf, recomputeXp, xpForSubject } from '../../src/features/progression/service';
import { createTicket, transitionTicket } from '../../src/features/ticket/commands';
import { fixedClock } from '../../src/server/clock';
import type { Tx } from '../../src/server/db/client';
import { domainEvent, notification, quest, userAchievement, xpLedgerEntry } from '../../src/server/db/schema';
import type { Actor } from '../../src/server/action-core';
import { addMember, makeGarden, makeGroup, makeZone, speciesRefId } from './fixtures';
import { inTx, makeUser, NOW, scopedCtx } from './helpers';

async function gardenWithCulture(tx: Tx, owner: Actor, opts: { seedSource?: 'own_saved'; seedParentCultureId?: string; method?: 'bought_plants' | 'direct_sowing' } = {}) {
  const gardenId = await makeGarden(tx, owner);
  const zoneId = await makeZone(tx, owner, gardenId, 'Planche 1');
  const ctx = await scopedCtx(tx, owner, gardenId);
  const { cultureId } = await createCulture(ctx, {
    gardenId, zoneId, speciesId: speciesRefId('tomate'), method: opts.method ?? 'bought_plants', anchorDate: '2026-05-10', seedSource: opts.seedSource ?? 'bought',
    ...(opts.seedParentCultureId ? { seedParentCultureId: opts.seedParentCultureId } : {}), plannedDates: {}, acknowledgeRotation: true,
  });
  return { gardenId, zoneId, cultureId, ctx };
}

describe('journal d\'XP', () => {
  it('[XP-02] une récolte de 2 kg rapporte 8 XP, visibles dans le journal et le profil', () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const { gardenId, cultureId, ctx } = await gardenWithCulture(tx, alice);
      const { harvestId } = await recordHarvest(ctx, { gardenId, cultureId, quantity: 2, unit: 'kg', seedSaving: false });
      expect(await xpForSubject(tx, alice.id, harvestId)).toBe(8);
      expect((await progressOf(tx, alice.id)).totalXp).toBeGreaterThanOrEqual(8);
    }));

  it('[XP-15] le journal d\'XP refuse UPDATE et DELETE en base', () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const { gardenId, cultureId, ctx } = await gardenWithCulture(tx, alice);
      await recordHarvest(ctx, { gardenId, cultureId, quantity: 1, unit: 'kg', seedSaving: false });
      await expect(tx.transaction((sp) => sp.update(xpLedgerEntry).set({ amount: 999 }).where(eq(xpLedgerEntry.userId, alice.id)))).rejects.toThrow();
      await expect(tx.transaction((sp) => sp.delete(xpLedgerEntry).where(eq(xpLedgerEntry.userId, alice.id)))).rejects.toThrow();
    }));

  it('[XP-14] un historique sans XP est reconstruit par xp:recompute ; un second recalcul ne trouve aucun écart', () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const { gardenId, cultureId } = await gardenWithCulture(tx, alice);
      // Événements « des lots 1 à 5 » enregistrés sans passer par le moteur : récolte et étape réelle.
      await tx.insert(domainEvent).values([
        { type: 'harvest.recorded', subjectType: 'harvest', subjectId: crypto.randomUUID(), gardenId, actorId: alice.id, payload: { cultureId, quantityKg: 2, unit: 'kg', seedSaving: false }, occurredAt: NOW },
        { type: 'culture.stage_recorded', subjectType: 'culture', subjectId: cultureId, gardenId, actorId: alice.id, payload: { stage: 'flowering', actualOn: '2026-06-10', plannedOn: null }, occurredAt: NOW },
      ]);
      const before = (await progressOf(tx, alice.id)).totalXp;
      const first = await recomputeXp(tx, { userId: alice.id, apply: true, now: NOW });
      expect(first.differences.length).toBeGreaterThanOrEqual(2);
      expect((await progressOf(tx, alice.id)).totalXp).toBe(before + 8 + 3);
      const second = await recomputeXp(tx, { userId: alice.id, apply: true, now: new Date(NOW.getTime() + 60_000) });
      expect(second.differences).toEqual([]);
    }));
});

describe('succès', () => {
  it('[ACH-01] [ACH-04] la première récolte donne first_harvest (notification in-app), conservé après suppression de la culture', () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const { gardenId, cultureId, ctx } = await gardenWithCulture(tx, alice);
      await recordHarvest(ctx, { gardenId, cultureId, quantity: 1, unit: 'kg', seedSaving: false });
      const [a] = await tx.select().from(userAchievement).where(and(eq(userAchievement.userId, alice.id), eq(userAchievement.achievementCode, 'first_harvest')));
      expect(a).toBeDefined();
      expect(await tx.select().from(notification).where(and(eq(notification.userId, alice.id), eq(notification.type, 'achievement')))).not.toHaveLength(0);
      await deleteCulture(ctx, cultureId);
      expect(await tx.select().from(userAchievement).where(and(eq(userAchievement.userId, alice.id), eq(userAchievement.achievementCode, 'first_harvest')))).toHaveLength(1);
      // L'XP de la récolte, elle, est annulée (RG-XP-02).
      const [sum] = await tx.select({ n: sql<number>`coalesce(sum(${xpLedgerEntry.amount}), 0)::int` }).from(xpLedgerEntry).where(and(eq(xpLedgerEntry.userId, alice.id), eq(xpLedgerEntry.cultureId, cultureId)));
      expect(sum?.n).toBe(0);
    }));

  it('[ACH-02] une culture de semences maison dont l\'origine a une récolte « semences » donne seed_saver à la levée', () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const parent = await gardenWithCulture(tx, alice);
      await recordHarvest(parent.ctx, { gardenId: parent.gardenId, cultureId: parent.cultureId, quantity: 0.1, unit: 'kg', seedSaving: true });
      const zoneId = await makeZone(tx, alice, parent.gardenId, 'Planche 2');
      const { cultureId } = await createCulture(parent.ctx, {
        gardenId: parent.gardenId, zoneId, speciesId: speciesRefId('tomate'), method: 'direct_sowing', anchorDate: '2026-05-10', seedSource: 'own_saved', seedParentCultureId: parent.cultureId, plannedDates: {}, acknowledgeRotation: true,
      });
      await recordStage(parent.ctx, { gardenId: parent.gardenId, cultureId, stage: 'emergence', actualOn: '2026-06-14' });
      expect(await tx.select().from(userAchievement).where(and(eq(userAchievement.userId, alice.id), eq(userAchievement.achievementCode, 'seed_saver')))).toHaveLength(1);
    }));
});

describe('quêtes', () => {
  it('[QST-02] une quête quotidienne liée à un ticket est terminée depuis la vue classique et rapporte 5 XP', () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const gardenId = await makeGarden(tx, alice);
      const ctx = await scopedCtx(tx, alice, gardenId);
      const { ticketId } = await createTicket(ctx, { gardenId, type: 'task', title: 'Arroser la serre', priority: 'normal', checklist: [], memberIds: [], groupIds: [], dueOn: '2026-06-15' });
      await generateQuests(tx, alice.id, NOW);
      const [q] = await tx.select().from(quest).where(and(eq(quest.userId, alice.id), eq(quest.ticketId, ticketId ?? '')));
      expect(q?.status).toBe('open');
      await transitionTicket(ctx, ticketId ?? '', 'done');
      const [done] = await tx.select().from(quest).where(eq(quest.id, q?.id ?? ''));
      expect(done?.status).toBe('done');
      expect((await tx.select().from(xpLedgerEntry).where(eq(xpLedgerEntry.idempotencyKey, `quest:${q?.id}`)))[0]?.amount).toBe(5);
    }));

  it('[QST-03] une quête non terminée expire en fin de période, sans trace d\'échec', () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const gardenId = await makeGarden(tx, alice);
      const ctx = await scopedCtx(tx, alice, gardenId);
      await createTicket(ctx, { gardenId, type: 'task', title: 'Pailler', priority: 'normal', checklist: [], memberIds: [], groupIds: [], dueOn: '2026-06-15' });
      await generateQuests(tx, alice.id, NOW);
      await generateQuests(tx, alice.id, new Date(NOW.getTime() + 2 * 86_400_000));
      const rows = await tx.select({ status: quest.status, periodStart: quest.periodStart }).from(quest).where(and(eq(quest.userId, alice.id), eq(quest.kind, 'daily'), eq(quest.periodStart, '2026-06-15')));
      expect(rows.map((r) => r.status)).toEqual(['expired']);
      expect(await tx.select().from(notification).where(eq(notification.userId, alice.id))).toHaveLength(0);
    }));
});

describe('progression collective', () => {
  it('[COL-02] le classement activé par un admin exclut le membre qui s\'en retire', () =>
    inTx(async (tx) => {
      const bruno = await makeUser(tx);
      const emma = await makeUser(tx);
      const david = await makeUser(tx);
      const gardenId = await makeGarden(tx, bruno, { orgType: 'collective' });
      await addMember(tx, gardenId, emma, 'member');
      await addMember(tx, gardenId, david, 'member');
      const scope = (await scopedCtx(tx, bruno, gardenId)).scope;
      expect(await leaderboard(tx, scope)).toBeNull();
      await setLeaderboard(await scopedCtx(tx, bruno, gardenId), true);
      await setLeaderboardOptOut(tx, emma.id, true);
      const board = await leaderboard(tx, scope);
      expect(board?.map((r) => r.userId).sort()).toEqual([bruno.id, david.id].sort());
      await expect(setLeaderboard(await scopedCtx(tx, emma, gardenId), false)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    }));

  it('[COL-03] un objectif « 30 tickets terminés en juin » pour Équipe serre affiche 12 / 30', () =>
    inTx(async (tx) => {
      const bruno = await makeUser(tx);
      const emma = await makeUser(tx);
      const gardenId = await makeGarden(tx, bruno, { orgType: 'collective' });
      const emmaM = await addMember(tx, gardenId, emma, 'member');
      const groupId = await makeGroup(tx, gardenId, 'Équipe serre', [emmaM]);
      const asBruno = await scopedCtx(tx, bruno, gardenId);
      await createGoal(asBruno, { gardenId, title: '30 tickets en juin', metric: 'tickets_completed', target: 30, periodStart: '2026-06-01', periodEnd: '2026-06-30', groupId });
      const asEmma = await scopedCtx(tx, emma, gardenId, { clock: fixedClock(new Date('2026-06-10T10:00:00Z')) });
      for (let i = 0; i < 13; i += 1) {
        const { ticketId } = await createTicket(asBruno, { gardenId, type: 'task', title: `Tâche ${i}`, priority: 'normal', checklist: [], memberIds: [emmaM], groupIds: [] });
        // 12 tickets terminés par un membre du groupe, 1 par l'owner (hors groupe).
        await transitionTicket(i < 12 ? asEmma : { ...asBruno, clock: fixedClock(new Date('2026-06-10T10:00:00Z')) }, ticketId ?? '', 'done');
      }
      const [g] = await goalsOf(tx, asBruno.scope);
      expect(g).toMatchObject({ current: 12, target: 30 });
    }));

  it('un objectif ne peut pas cibler le groupe d\'un autre jardin (VALIDATION, rien n\'est écrit)', () =>
    inTx(async (tx) => {
      const bruno = await makeUser(tx);
      const gardenId = await makeGarden(tx, bruno, { orgType: 'collective' });
      const other = await makeGarden(tx, bruno, { orgType: 'collective' });
      const foreignGroup = await makeGroup(tx, other, 'Équipe voisine', []);
      const asBruno = await scopedCtx(tx, bruno, gardenId);
      await expect(createGoal(asBruno, { gardenId, title: 'Objectif', metric: 'tickets_completed', target: 10, periodStart: '2026-06-01', periodEnd: '2026-06-30', groupId: foreignGroup }))
        .rejects.toMatchObject({ code: 'VALIDATION' });
      expect(await goalsOf(tx, asBruno.scope)).toHaveLength(0);
    }));
});

