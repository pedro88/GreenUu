import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createCulture } from '../../src/features/culture/service';
import { recordHarvest } from '../../src/features/harvest/service';
import { createJournalEntry } from '../../src/features/journal/service';
import { fixedClock } from '../../src/server/clock';
import type { Tx } from '../../src/server/db/client';
import { domainEvent, harvest, journalEntry, xpLedgerEntry } from '../../src/server/db/schema';
import type { Actor } from '../../src/server/action-core';
import { addMember, makeGarden, makeZone, speciesRefId } from './fixtures';
import { inTx, makeUser, scopedCtx } from './helpers';

const rect = (x: number, y: number, w: number, h: number) => ({ v: 1 as const, kind: 'rect' as const, x, y, w, h });

async function setup(tx: Tx, owner: Actor) {
  const gardenId = await makeGarden(tx, owner);
  const ctx = await scopedCtx(tx, owner, gardenId);
  const bed = await makeZone(tx, owner, gardenId, 'Planche 1', 'bed', null, rect(0, 0, 200, 200));
  const { cultureId } = await createCulture(ctx, { gardenId, zoneId: bed, speciesId: speciesRefId('tomate'), method: 'bought_plants', anchorDate: '2026-05-10', seedSource: 'bought', plannedDates: {}, acknowledgeRotation: true });
  return { gardenId, ctx, cultureId };
}

describe('saisies hors-ligne (§12.10)', () => {
  it('[OFF-03] le même ID client renvoyé deux fois ne crée qu\'une entrée et une récolte, sans XP en double', () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const { gardenId, ctx, cultureId } = await setup(tx, alice);
      const obs = { gardenId, cultureId, kind: 'note' as const, body: 'Premières fleurs sur le pied du fond', attachmentIds: [], clientId: randomUUID() };
      const a = await createJournalEntry(ctx, obs);
      const b = await createJournalEntry(ctx, obs);
      expect(b.entryId).toBe(a.entryId);
      expect(a.entryId).toBe(obs.clientId);
      const h = { gardenId, cultureId, quantity: 2, unit: 'kg' as const, seedSaving: false, clientId: randomUUID() };
      const h1 = await recordHarvest(ctx, h);
      const h2 = await recordHarvest(ctx, h);
      expect(h2).toEqual(h1);
      expect(await tx.select().from(journalEntry).where(eq(journalEntry.id, obs.clientId))).toHaveLength(1);
      expect(await tx.select().from(harvest).where(eq(harvest.id, h.clientId))).toHaveLength(1);
      // Un seul événement, donc une seule ligne d'XP par saisie.
      for (const id of [obs.clientId, h.clientId]) {
        expect(await tx.select().from(domainEvent).where(eq(domainEvent.subjectId, id))).toHaveLength(1);
        expect((await tx.select().from(xpLedgerEntry).where(and(eq(xpLedgerEntry.subjectId, id), eq(xpLedgerEntry.reason, 'award')))).length).toBeLessThanOrEqual(1);
      }
    }));

  it('[OFF-04] un ID client déjà pris dans un autre jardin ou par un autre auteur donne CONFLICT, sans rien révéler', () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const { gardenId, ctx, cultureId } = await setup(tx, alice);
      const taken = randomUUID();
      await createJournalEntry(ctx, { gardenId, cultureId, kind: 'note', body: 'Note privée d\'Alice sur la planche', attachmentIds: [], clientId: taken });
      // Bruno, dans son propre jardin, réutilise l'ID.
      const bruno = await makeUser(tx);
      const other = await setup(tx, bruno);
      const err = await createJournalEntry(other.ctx, { gardenId: other.gardenId, cultureId: other.cultureId, kind: 'note', body: 'Autre note', attachmentIds: [], clientId: taken }).catch((e: unknown) => e);
      expect(err).toMatchObject({ code: 'CONFLICT', message: 'clientIdTaken' });
      expect(JSON.stringify(err)).not.toContain('privée');
      // Chloé, membre du jardin d'Alice, réutilise l'ID d'une entrée qui n'est pas la sienne.
      const chloe = await makeUser(tx);
      await addMember(tx, gardenId, chloe, 'member');
      await expect(createJournalEntry(await scopedCtx(tx, chloe, gardenId), { gardenId, cultureId, kind: 'note', body: 'Note de Chloé', attachmentIds: [], clientId: taken })).rejects.toMatchObject({ code: 'CONFLICT' });
      // Même chose pour une récolte dont l'ID est celui de l'entrée de journal d'un autre auteur : pas de collision entre tables,
      // mais un ID de récolte pris par un autre auteur est refusé.
      const hid = randomUUID();
      await recordHarvest(ctx, { gardenId, cultureId, quantity: 1, unit: 'kg', seedSaving: false, clientId: hid });
      await expect(recordHarvest(await scopedCtx(tx, chloe, gardenId), { gardenId, cultureId, quantity: 5, unit: 'kg', seedSaving: false, clientId: hid })).rejects.toMatchObject({ code: 'CONFLICT' });
    }));

  it('[OFF-07] saisie à 23 h 50 (heure du jardin), envoyée le lendemain à 0 h 10 : elle garde l\'instant et le jour de saisie', () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const { gardenId, cultureId } = await setup(tx, alice);
      // Le 15 juin 2026, 23 h 50 à Bruxelles (UTC+2) ; envoi le 16 juin à 0 h 10.
      const capturedAt = '2026-06-15T23:50:00+02:00';
      const sent = new Date('2026-06-16T00:10:00+02:00');
      const ctx = await scopedCtx(tx, alice, gardenId, { clock: fixedClock(sent) });
      const { entryId } = await createJournalEntry(ctx, { gardenId, cultureId, kind: 'note', body: 'Floraison du troisième bouquet', attachmentIds: [], clientId: randomUUID(), capturedAt });
      const [e] = await tx.select({ observedAt: journalEntry.observedAt }).from(journalEntry).where(eq(journalEntry.id, entryId));
      expect(e?.observedAt.toISOString()).toBe(new Date(capturedAt).toISOString());
      const [ev] = await tx.select({ at: domainEvent.occurredAt }).from(domainEvent).where(eq(domainEvent.subjectId, entryId));
      expect(ev?.at.toISOString()).toBe(new Date(capturedAt).toISOString());
      const xp = await tx.select({ day: xpLedgerEntry.localDay }).from(xpLedgerEntry).where(eq(xpLedgerEntry.subjectId, entryId));
      expect(xp.map((x) => x.day)).toEqual(['2026-06-15']);
      const { harvestId } = await recordHarvest(ctx, { gardenId, cultureId, quantity: 1, unit: 'kg', seedSaving: false, clientId: randomUUID(), capturedAt });
      const [h] = await tx.select({ on: harvest.harvestedOn }).from(harvest).where(eq(harvest.id, harvestId));
      expect(h?.on).toBe('2026-06-15');
      // Un instant de saisie dans le futur, ou de plus de 7 jours, est borné.
      const far = await createJournalEntry(ctx, { gardenId, cultureId, kind: 'note', body: 'Vieille note retrouvée dans la file', attachmentIds: [], clientId: randomUUID(), capturedAt: '2026-05-01T08:00:00+02:00' });
      const [ev2] = await tx.select({ at: domainEvent.occurredAt }).from(domainEvent).where(eq(domainEvent.subjectId, far.entryId));
      expect(ev2?.at.toISOString()).toBe(new Date(sent.getTime() - 7 * 86_400_000).toISOString());
    }));
});
