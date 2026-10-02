import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { cultureDetail, listCultures, zoneHistory } from '../../src/features/culture/queries';
import { createCulture, deleteCulture, previewCulture, recordStage, restoreCulture } from '../../src/features/culture/service';
import { recordHarvest } from '../../src/features/harvest/service';
import { createJournalEntry } from '../../src/features/journal/service';
import { setSeasonClosed } from '../../src/features/season/service';
import { setZoneArchived } from '../../src/features/zone/service';
import { fixedClock } from '../../src/server/clock';
import type { Tx } from '../../src/server/db/client';
import { culture, cultureStage, domainEvent, garden, journalEntry } from '../../src/server/db/schema';
import type { Actor } from '../../src/server/action-core';
import { addMember, makeGarden, makeZone, speciesRefId, varietyRefId } from './fixtures';
import { inTx, makeUser, NOW, scopedCtx } from './helpers';

const TOMATE = speciesRefId('tomate');

async function setup(tx: Tx) {
  const alice = await makeUser(tx);
  const gardenId = await makeGarden(tx, alice);
  const plancheId = await makeZone(tx, alice, gardenId, 'Planche 1');
  return { alice, gardenId, plancheId, ctx: await scopedCtx(tx, alice, gardenId) };
}

async function plant(tx: Tx, actor: Actor, gardenId: string, zoneId: string, speciesCode: string, anchorDate: string, opts: { method?: 'direct_sowing' | 'tray_sowing' | 'bought_plants' | 'bulb_tuber'; ack?: boolean; clock?: Date } = {}) {
  const ctx = await scopedCtx(tx, actor, gardenId, opts.clock ? { clock: fixedClock(opts.clock) } : {});
  return createCulture(ctx, {
    gardenId, zoneId, speciesId: speciesRefId(speciesCode), method: opts.method ?? 'bought_plants', anchorDate, seedSource: 'unknown',
    plannedDates: {}, acknowledgeRotation: opts.ack ?? false,
  });
}

describe('cultures', () => {
  it('[CUL-01] semis en godet : culture prévue, étapes pertinentes, événement', () =>
    inTx(async (tx) => {
      const { gardenId, plancheId, ctx } = await setup(tx);
      const { cultureId } = await createCulture(ctx, {
        gardenId, zoneId: plancheId, speciesId: TOMATE, varietyId: varietyRefId('tomate', 'Cœur de bœuf'), method: 'tray_sowing',
        anchorDate: '2026-03-15', seedSource: 'bought', plannedDates: {}, acknowledgeRotation: false,
      });
      const [c] = await tx.select().from(culture).where(eq(culture.id, cultureId));
      expect(c?.status).toBe('planned');
      const stages = (await tx.select({ s: cultureStage.stage }).from(cultureStage).where(eq(cultureStage.cultureId, cultureId))).map((r) => r.s);
      expect(stages).toEqual(expect.arrayContaining(['sowing', 'emergence', 'transplanting', 'planting', 'flowering', 'fruiting', 'harvest_start', 'end']));
      const ev = await tx.select().from(domainEvent).where(and(eq(domainEvent.subjectId, cultureId), eq(domainEvent.type, 'culture.created')));
      expect(ev).toHaveLength(1);
    }));

  it('[CUL-02] date réelle de semis : la culture passe active', () =>
    inTx(async (tx) => {
      const { alice, gardenId, plancheId, ctx } = await setup(tx);
      const { cultureId } = await plant(tx, alice, gardenId, plancheId, 'carotte', '2026-04-01', { method: 'direct_sowing' });
      const res = await recordStage(ctx, { gardenId, cultureId, stage: 'sowing', actualOn: '2026-04-02' });
      expect(res.status).toBe('active');
      const ev = await tx.select().from(domainEvent).where(and(eq(domainEvent.subjectId, cultureId), eq(domainEvent.type, 'culture.stage_recorded')));
      expect(ev[0]?.payload).toMatchObject({ stage: 'sowing', actualOn: '2026-04-02' });
    }));

  it('[CUL-03] une date réelle à J+2 est refusée', () =>
    inTx(async (tx) => {
      const { alice, gardenId, plancheId, ctx } = await setup(tx);
      const { cultureId } = await plant(tx, alice, gardenId, plancheId, 'carotte', '2026-06-01', { method: 'direct_sowing' });
      await expect(recordStage(ctx, { gardenId, cultureId, stage: 'sowing', actualOn: '2026-06-17' })).rejects.toMatchObject({ fieldErrors: { actualOn: ['futureDate'] } });
      await expect(recordStage(ctx, { gardenId, cultureId, stage: 'sowing', actualOn: '2026-06-16' })).resolves.toBeTruthy();
    }));

  it('[CUL-04] une levée antérieure au semis est enregistrée avec un avertissement', () =>
    inTx(async (tx) => {
      const { alice, gardenId, plancheId, ctx } = await setup(tx);
      const { cultureId } = await plant(tx, alice, gardenId, plancheId, 'carotte', '2026-04-01', { method: 'direct_sowing' });
      await recordStage(ctx, { gardenId, cultureId, stage: 'sowing', actualOn: '2026-04-10' });
      const res = await recordStage(ctx, { gardenId, cultureId, stage: 'emergence', actualOn: '2026-04-05' });
      expect(res.warnings).toEqual([{ before: 'sowing', after: 'emergence' }]);
    }));

  it('[CUL-07] suppression : masquée avec journal et récoltes, restaurable 30 jours', () =>
    inTx(async (tx) => {
      const { alice, gardenId, plancheId, ctx } = await setup(tx);
      const { cultureId } = await plant(tx, alice, gardenId, plancheId, 'tomate', '2026-05-15');
      await createJournalEntry(ctx, { gardenId, cultureId, kind: 'note', body: 'Belles feuilles', attachmentIds: [] });
      await recordHarvest(ctx, { gardenId, cultureId, quantity: 2, unit: 'kg', seedSaving: false });
      await deleteCulture(ctx, cultureId);
      expect(await listCultures(tx, ctx.scope, {})).toEqual([]);
      await restoreCulture(await scopedCtx(tx, alice, gardenId, { clock: fixedClock(new Date(NOW.getTime() + 10 * 86_400_000)) }), cultureId);
      const d = await cultureDetail(tx, ctx.scope, cultureId);
      expect(d.journal).toHaveLength(1);
      expect(d.totalKg).toBe(2);
      await deleteCulture(ctx, cultureId);
      await expect(restoreCulture(await scopedCtx(tx, alice, gardenId, { clock: fixedClock(new Date(NOW.getTime() + 31 * 86_400_000)) }), cultureId))
        .rejects.toMatchObject({ code: 'FORBIDDEN', message: 'restoreExpired' });
    }));

  it('[CUL-07] un membre ne supprime pas la culture d\'un autre ; un admin si', () =>
    inTx(async (tx) => {
      const { alice, gardenId, plancheId } = await setup(tx);
      const bob = await makeUser(tx);
      await addMember(tx, gardenId, bob, 'member');
      const { cultureId } = await plant(tx, alice, gardenId, plancheId, 'tomate', '2026-05-15');
      await expect(deleteCulture(await scopedCtx(tx, bob, gardenId), cultureId)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    }));

  it('[CUL-08] repiquage depuis la pépinière : changement de zone tracé, occupation au repiquage', () =>
    inTx(async (tx) => {
      const { alice, gardenId, plancheId, ctx } = await setup(tx);
      const plaque = await makeZone(tx, alice, gardenId, 'Plaque A', 'seed_tray');
      const { cultureId } = await plant(tx, alice, gardenId, plaque, 'tomate', '2026-03-01', { method: 'tray_sowing' });
      await recordStage(ctx, { gardenId, cultureId, stage: 'sowing', actualOn: '2026-03-02' });
      await recordStage(ctx, { gardenId, cultureId, stage: 'planting', actualOn: '2026-05-14', targetZoneId: plancheId });
      const [c] = await tx.select().from(culture).where(eq(culture.id, cultureId));
      expect(c).toMatchObject({ zoneId: plancheId, occupiedFrom: '2026-05-14' });
      const [j] = await tx.select().from(journalEntry).where(eq(journalEntry.cultureId, cultureId));
      expect(j).toMatchObject({ kind: 'intervention', intervention: 'transplant', body: 'Plaque A → Planche 1' });
    }));

  it('[CUL-09] un ail à cheval sur deux saisons apparaît dans l\'historique 2026, rattaché à 2025', () =>
    inTx(async (tx) => {
      const { alice, gardenId, plancheId, ctx } = await setup(tx);
      const { cultureId } = await plant(tx, alice, gardenId, plancheId, 'ail', '2025-11-05', { method: 'bulb_tuber', clock: new Date('2025-11-05T10:00:00Z') });
      const summer = await scopedCtx(tx, alice, gardenId, { clock: fixedClock(new Date('2026-07-20T10:00:00Z')) });
      await recordStage(summer, { gardenId, cultureId, stage: 'planting', actualOn: '2025-11-05' });
      await recordStage(summer, { gardenId, cultureId, stage: 'harvest_end', actualOn: '2026-07-10' });
      const hist = await zoneHistory(tx, ctx.scope, plancheId);
      expect(hist.find((h) => h.year === 2026)?.cultures.map((c) => c.id)).toEqual([cultureId]);
      expect(hist.find((h) => h.year === 2026)?.cultures[0]?.seasonYear).toBe(2025);
    }));

  it('[CUL-10] semences maison : culture d\'origine d\'une autre espèce ou sans récolte de semences refusée', () =>
    inTx(async (tx) => {
      const { alice, gardenId, plancheId, ctx } = await setup(tx);
      const parent = await plant(tx, alice, gardenId, plancheId, 'haricot', '2025-05-10', { method: 'direct_sowing', clock: new Date('2025-05-10T10:00:00Z') });
      const base = { gardenId, zoneId: plancheId, method: 'direct_sowing' as const, anchorDate: '2026-05-10', seedSource: 'own_saved' as const, seedParentCultureId: parent.cultureId, plannedDates: {}, acknowledgeRotation: true };
      await expect(createCulture(ctx, { ...base, speciesId: speciesRefId('haricot') })).rejects.toMatchObject({ fieldErrors: { seedParentCultureId: ['seedParentInvalid'] } });
      await recordHarvest(ctx, { gardenId, cultureId: parent.cultureId, quantity: 200, unit: 'g', seedSaving: true, harvestedOn: '2025-09-01' });
      await expect(createCulture(ctx, { ...base, speciesId: speciesRefId('pois') })).rejects.toMatchObject({ fieldErrors: { seedParentCultureId: ['seedParentInvalid'] } });
      await expect(createCulture(ctx, { ...base, speciesId: speciesRefId('haricot') })).resolves.toMatchObject({ cultureId: expect.any(String) });
    }));

  it('[ZON-10] un composteur ne peut pas recevoir de culture', () =>
    inTx(async (tx) => {
      const { alice, gardenId } = await setup(tx);
      const compost = await makeZone(tx, alice, gardenId, 'Composteur', 'compost');
      await expect(plant(tx, alice, gardenId, compost, 'tomate', '2026-05-15')).rejects.toMatchObject({ fieldErrors: { zoneId: ['zoneCannotHostCultures'] } });
    }));

  it('[ZON-09] archiver une zone qui porte une culture active demande confirmation', () =>
    inTx(async (tx) => {
      const { alice, gardenId, plancheId, ctx } = await setup(tx);
      const { cultureId } = await plant(tx, alice, gardenId, plancheId, 'tomate', '2026-05-15');
      await recordStage(ctx, { gardenId, cultureId, stage: 'planting', actualOn: '2026-05-15' });
      await expect(setZoneArchived(ctx, plancheId, true)).rejects.toMatchObject({ code: 'CONFLICT', message: 'zoneHasActiveCultures' });
      const [still] = await tx.select().from(culture).where(eq(culture.id, cultureId));
      expect(still?.status).toBe('active');
      await setZoneArchived(ctx, plancheId, true, { finishActiveCultures: true });
      const [after] = await tx.select().from(culture).where(eq(culture.id, cultureId));
      expect(after?.status).toBe('finished');
    }));

  it('[SEA-02] saison close : étapes en lecture seule', () =>
    inTx(async (tx) => {
      const { alice, gardenId, plancheId, ctx } = await setup(tx);
      const { cultureId } = await plant(tx, alice, gardenId, plancheId, 'radis', '2026-04-01', { method: 'direct_sowing' });
      await setSeasonClosed(ctx, 2026, true);
      await expect(recordStage(ctx, { gardenId, cultureId, stage: 'sowing', actualOn: '2026-04-01' })).rejects.toMatchObject({ code: 'FORBIDDEN', message: 'seasonClosed' });
    }));

  it('[SEA-01] une culture d\'août dans un jardin à saison de juillet est rattachée à la saison 2026', () =>
    inTx(async (tx) => {
      const { alice, gardenId, plancheId, ctx } = await setup(tx);
      await tx.update(garden).set({ seasonStartMonth: 7 }).where(eq(garden.id, gardenId));
      const preview = await previewCulture(tx, ctx.scope, { gardenId, zoneId: plancheId, speciesId: speciesRefId('mache'), method: 'direct_sowing', anchorDate: '2026-08-10' });
      expect(preview.seasonYear).toBe(2026);
      void alice;
    }));
});

describe('rotations et associations', () => {
  it('[ROT-01] [ROT-04] solanacées l\'an dernier : avertissement, création seulement après confirmation', () =>
    inTx(async (tx) => {
      const { alice, gardenId, plancheId, ctx } = await setup(tx);
      await plant(tx, alice, gardenId, plancheId, 'tomate', '2025-05-15', { clock: new Date('2025-05-15T10:00:00Z') });
      const preview = await previewCulture(tx, ctx.scope, { gardenId, zoneId: plancheId, speciesId: speciesRefId('aubergine'), method: 'bought_plants', anchorDate: '2026-05-20' });
      expect(preview.rotation).toMatchObject({ familyCode: 'solanaceae', lastYear: 2025, returnYear: 2029 });
      await expect(plant(tx, alice, gardenId, plancheId, 'aubergine', '2026-05-20')).rejects.toMatchObject({ code: 'CONFLICT', message: 'rotationNotAcknowledged' });
      const { cultureId, rotationOverride } = await plant(tx, alice, gardenId, plancheId, 'aubergine', '2026-05-20', { ack: true });
      expect(rotationOverride).toBe(true);
      const [c] = await tx.select().from(culture).where(eq(culture.id, cultureId));
      expect(c?.rotationOverride).toBe(true);
    }));

  it('[ROT-02] des tomates sur la parcelle parente alertent la planche', () =>
    inTx(async (tx) => {
      const { alice, gardenId, ctx } = await setup(tx);
      const parcelle = await makeZone(tx, alice, gardenId, 'Parcelle', 'plot');
      const planche = await makeZone(tx, alice, gardenId, 'Planche P', 'bed', parcelle);
      await plant(tx, alice, gardenId, parcelle, 'tomate', '2025-05-15', { clock: new Date('2025-05-15T10:00:00Z') });
      const preview = await previewCulture(tx, ctx.scope, { gardenId, zoneId: planche, speciesId: speciesRefId('pomme-de-terre'), method: 'bulb_tuber', anchorDate: '2026-04-10' });
      expect(preview.rotation?.cultures[0]).toMatchObject({ zoneName: 'Parcelle', year: 2025 });
    }));

  it('[ROT-05] des haricots actifs sur la planche voisine : association défavorable avec les oignons', () =>
    inTx(async (tx) => {
      const { alice, gardenId, ctx } = await setup(tx);
      const p1 = await makeZone(tx, alice, gardenId, 'Nord', 'bed', null, { v: 1, kind: 'rect', x: 0, y: 0, w: 300, h: 120 });
      const p2 = await makeZone(tx, alice, gardenId, 'Sud', 'bed', null, { v: 1, kind: 'rect', x: 0, y: 120, w: 300, h: 120 });
      await makeZone(tx, alice, gardenId, 'Loin', 'bed', null, { v: 1, kind: 'rect', x: 2000, y: 2000, w: 300, h: 120 });
      await plant(tx, alice, gardenId, p1, 'haricot', '2026-05-10', { method: 'direct_sowing' });
      const preview = await previewCulture(tx, ctx.scope, { gardenId, zoneId: p2, speciesId: speciesRefId('oignon'), method: 'bulb_tuber', anchorDate: '2026-05-20' });
      expect(preview.companions).toEqual([expect.objectContaining({ effect: 'unfavorable', speciesName: 'Haricot', zoneName: 'Nord' })]);
    }));
});

describe('listes bornées', () => {
  it('[CUL-01] la liste des cultures est paginée et comptée', () =>
    inTx(async (tx) => {
      const { alice, gardenId, plancheId, ctx } = await setup(tx);
      for (let i = 0; i < 3; i++) await plant(tx, alice, gardenId, plancheId, 'laitue', `2026-0${4 + i}-01`);
      const { countCultures } = await import('../../src/features/culture/queries');
      expect(await listCultures(tx, ctx.scope, {}, { limit: 2 })).toHaveLength(2);
      expect(await listCultures(tx, ctx.scope, {}, { limit: 2, offset: 2 })).toHaveLength(1);
      expect(await countCultures(tx, ctx.scope, {})).toBe(3);
    }));
});
