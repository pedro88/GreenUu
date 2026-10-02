import { and, eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createCulture, previewCulture, zoneWarningsBatch } from '../../src/features/culture/service';
import { recordHarvest } from '../../src/features/harvest/service';
import { createJournalEntry } from '../../src/features/journal/service';
import { buildExport, isDeactivated, purgeDeletedAccounts, purgeExpiredExports, readExport, requestDeletion, requestExport, restoreAccount } from '../../src/features/privacy/service';
import { createEngineV1 } from '../../src/features/reco/engine';
import { gardenPseudo, refreshSharedFacts, speciesCommunityStats } from '../../src/features/reco/facts';
import { resultForm, setResultSharing, submitResult } from '../../src/features/result/service';
import { DELETED_PSEUDO } from '../../src/features/privacy/service';
import { signPayload } from '../../src/lib/tokens';
import type { Actor } from '../../src/server/action-core';
import { fixedClock } from '../../src/server/clock';
import type { Tx } from '../../src/server/db/client';
import { consent, cultureResult, domainEvent, garden, gardenMember, problem, session, sharedResultFact, userProfile } from '../../src/server/db/schema';
import { testEnv } from './env';
import { addMember, makeGarden, makeZone, speciesRefId } from './fixtures';
import { ctxFor, inTx, makeUser, NOW, recordingQueue, scopedCtx } from './helpers';

const RHUBARBE = speciesRefId('rhubarbe');

/** Jardin Cfb plein air avec une culture récoltée ; renvoie de quoi saisir un bilan. */
async function gardenWithHarvest(tx: Tx, owner: Actor, speciesId = RHUBARBE) {
  const gardenId = await makeGarden(tx, owner);
  await tx.update(garden).set({ koppen: 'Cfb', altitudeM: 100 }).where(eq(garden.id, gardenId));
  const zoneId = await makeZone(tx, owner, gardenId, 'Planche 1');
  const ctx = await scopedCtx(tx, owner, gardenId);
  const { cultureId } = await createCulture(ctx, { gardenId, zoneId, speciesId, method: 'bought_plants', anchorDate: '2026-04-10', seedSource: 'bought', plannedDates: {}, acknowledgeRotation: true });
  await recordHarvest(ctx, { gardenId, cultureId, quantity: 4.2, unit: 'kg', seedSaving: false, harvestedOn: '2026-06-01' });
  return { gardenId, zoneId, cultureId, ctx };
}

const fullResult = (gardenId: string, cultureId: string) => ({
  gardenId, cultureId, totalKg: 4.2, noHarvest: false, quality: 4, successPct: 80, rating: 4, wouldGrowAgain: true, problems: [], noProblem: true,
});

async function shared(tx: Tx, gardenId: string) {
  const p = await gardenPseudo(tx, gardenId);
  return tx.select().from(sharedResultFact).where(eq(sharedResultFact.gardenPseudo, p ?? ''));
}

describe('bilans', () => {
  it('[RES-02] un mildiou relevé au journal est pré-coché dans le bilan', () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const { gardenId, cultureId, ctx } = await gardenWithHarvest(tx, alice);
      await createJournalEntry(ctx, { gardenId, cultureId, kind: 'disease', problemCode: 'mildew', severity: 2, attachmentIds: [] });
      const [mildew] = await tx.select({ id: problem.id }).from(problem).where(eq(problem.code, 'mildew'));
      const form = await resultForm(tx, ctx.scope, cultureId);
      expect(form.problems).toContainEqual({ problemId: mildew?.id, severity: 2 });
      expect(form.prefill.totalKg).toBe(4.2);
    }));

  it('[RES-05] un second bilan pour la même culture et la même saison est une mise à jour', () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const { gardenId, cultureId, ctx } = await gardenWithHarvest(tx, alice);
      expect(await submitResult(ctx, { ...fullResult(gardenId, cultureId), successPct: null, rating: null })).toMatchObject({ completeness: 60, updated: false });
      expect(await submitResult(ctx, fullResult(gardenId, cultureId))).toMatchObject({ completeness: 100, updated: true });
      expect(await tx.select().from(cultureResult).where(eq(cultureResult.cultureId, cultureId))).toHaveLength(1);
      const events = await tx.select({ type: domainEvent.type }).from(domainEvent).where(and(eq(domainEvent.gardenId, gardenId), sql`${domainEvent.type} like 'result.%'`));
      expect(events.map((e) => e.type).sort()).toEqual(['result.submitted', 'result.updated']);
    }));
});

describe('partage anonymisé', () => {
  it('[PRV-01] un jardin sans partage n\'a aucune ligne dans shared_result_fact', () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const { gardenId, cultureId, ctx } = await gardenWithHarvest(tx, alice);
      await submitResult(ctx, fullResult(gardenId, cultureId));
      await refreshSharedFacts(tx);
      expect(await shared(tx, gardenId)).toHaveLength(0);
    }));

  it('[PRV-02] [PRV-04] l\'owner active le partage (consentement versionné), puis le révoque', () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const { gardenId, cultureId, ctx } = await gardenWithHarvest(tx, alice);
      await submitResult(ctx, fullResult(gardenId, cultureId));
      const jobs = recordingQueue();
      await setResultSharing({ ...ctx, jobs }, true);
      expect(jobs.others).toContainEqual({ name: 'reco.refresh-facts', data: {} });
      const [c] = await tx.select().from(consent).where(and(eq(consent.gardenId, gardenId), eq(consent.kind, 'share_results')));
      expect(c).toMatchObject({ userId: alice.id, version: 'partage-2026-10', revokedAt: null });
      await refreshSharedFacts(tx);
      expect(await shared(tx, gardenId)).toHaveLength(1);
      await setResultSharing(ctx, false);
      await refreshSharedFacts(tx);
      expect(await shared(tx, gardenId)).toHaveLength(0);
      const [revoked] = await tx.select({ revokedAt: consent.revokedAt }).from(consent).where(eq(consent.id, c?.id ?? ''));
      expect(revoked?.revokedAt).not.toBeNull();
    }));

  it('[PRV-03] un admin (non owner) ne peut pas activer le partage', () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const bob = await makeUser(tx);
      const gardenId = await makeGarden(tx, alice);
      await addMember(tx, gardenId, bob, 'admin');
      await expect(setResultSharing(await scopedCtx(tx, bob, gardenId), true)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    }));

  it('[PRV-05] la vue ne contient ni identifiant, ni coordonnées, ni nom, ni texte libre', () =>
    inTx(async (tx) => {
      const rows = await tx.execute<{ attname: string }>(sql`select attname from pg_attribute where attrelid = 'shared_result_fact'::regclass and attnum > 0 and not attisdropped`);
      const cols = [...rows].map((r) => r.attname).sort();
      expect(cols).toEqual(['altitude_100', 'environment', 'fact_id', 'garden_pseudo', 'geohash4', 'hardiness_zone', 'koppen', 'method', 'planting_doy', 'practices', 'problem_codes',
        'quality', 'rating', 'soil_ph_half', 'soil_type', 'sowing_doy', 'species_id', 'success_pct', 'variety_id', 'year', 'yield_kg_m2']);
      for (const forbidden of ['user_id', 'garden_id', 'lat', 'lng', 'name', 'notes', 'author_id', 'zone_id', 'culture_id']) expect(cols).not.toContain(forbidden);
    }));

  async function communityGardens(tx: Tx, count: number) {
    for (let i = 0; i < count; i += 1) {
      const owner = await makeUser(tx);
      const { gardenId, cultureId, ctx } = await gardenWithHarvest(tx, owner);
      await submitResult(ctx, fullResult(gardenId, cultureId));
      await setResultSharing(ctx, true);
    }
    await refreshSharedFacts(tx);
  }

  it('[PRV-06] 4 jardins seulement : aucun agrégat sur la fiche espèce (k < 5)', () =>
    inTx(async (tx) => {
      const before = (await speciesCommunityStats(tx, RHUBARBE)).gardens;
      await communityGardens(tx, Math.max(0, 4 - before));
      const stats = await speciesCommunityStats(tx, RHUBARBE);
      expect(stats.gardens).toBeLessThan(5);
      expect(stats.shown).toBe(false);
      await communityGardens(tx, 5 - stats.gardens);
      expect(await speciesCommunityStats(tx, RHUBARBE)).toMatchObject({ shown: true, meanSuccessPct: 80 });
    }));

  it('[RCO-05] 3 jardins similaires : démarrage à froid, 3 sur les 5 nécessaires, source référentiel ou guide', () =>
    inTx(async (tx) => {
      const before = (await speciesCommunityStats(tx, RHUBARBE)).gardens;
      await communityGardens(tx, Math.max(0, 3 - before));
      const alice = await makeUser(tx);
      const { gardenId, zoneId, ctx } = await gardenWithHarvest(tx, alice);
      const recos = await createEngineV1(tx).recommendVarieties({ gardenId, zoneId, from: new Date('2026-03-01'), to: new Date('2026-05-31'), speciesId: RHUBARBE }, ctx.scope);
      const r = recos.find((x) => x.speciesId === RHUBARBE);
      expect(r?.explanation.confidence).toBe('cold_start');
      expect(r?.explanation.gardensCount).toBe(3);
      expect(['reference', 'guide']).toContain(r?.explanation.source);
    }));
});

describe('suppression du compte', () => {
  it('[PRV-08] sans transfert, la propriété passe à l\'admin le plus ancien à J+30 et les contributions sont anonymisées', () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const oldAdmin = await makeUser(tx);
      const newAdmin = await makeUser(tx);
      const gardenId = await makeGarden(tx, alice);
      await addMember(tx, gardenId, oldAdmin, 'admin');
      await tx.update(gardenMember).set({ joinedAt: new Date('2026-01-01') }).where(and(eq(gardenMember.gardenId, gardenId), eq(gardenMember.userId, oldAdmin.id)));
      await addMember(tx, gardenId, newAdmin, 'admin');
      await requestDeletion(ctxFor(tx, alice), { confirmTransferToMember: false });
      // Pendant le délai de grâce, rien ne change dans le jardin.
      const purgedEarly = await purgeDeletedAccounts(tx, { put: async () => undefined, get: async () => null, remove: async () => undefined }, new Date(NOW.getTime() + 10 * 86_400_000));
      expect(purgedEarly).toBe(0);
      await purgeDeletedAccounts(tx, { put: async () => undefined, get: async () => null, remove: async () => undefined }, new Date(NOW.getTime() + 31 * 86_400_000));
      const [owner] = await tx.select({ userId: gardenMember.userId }).from(gardenMember).where(and(eq(gardenMember.gardenId, gardenId), eq(gardenMember.role, 'owner'), sql`${gardenMember.leftAt} is null`));
      expect(owner?.userId).toBe(oldAdmin.id);
      const [p] = await tx.select({ pseudo: userProfile.pseudo }).from(userProfile).where(eq(userProfile.userId, alice.id));
      expect(p?.pseudo.startsWith(DELETED_PSEUDO)).toBe(true);
    }));

  it('[PRV-09] la demande de suppression désactive le compte tout de suite : sessions révoquées, compte désactivé jusqu\'au rétablissement', () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      await tx.insert(session).values({ id: crypto.randomUUID(), userId: alice.id, token: `t-${alice.id}`, expiresAt: new Date(NOW.getTime() + 86_400_000) });
      expect(await isDeactivated(tx, alice.id)).toBe(false);
      const jobs = recordingQueue();
      await requestDeletion(ctxFor(tx, alice, { jobs }), { confirmTransferToMember: false });
      expect(await tx.select().from(session).where(eq(session.userId, alice.id))).toHaveLength(0);
      expect(await isDeactivated(tx, alice.id)).toBe(true);
      const token = jobs.jobs[0]?.data.text.match(/\/retablissement\/(\S+)/)?.[1] ?? '';
      await restoreAccount(tx, token, NOW);
      expect(await isDeactivated(tx, alice.id)).toBe(false);
    }));

  it('[PRV-09] le lien de rétablissement reçu par e-mail rétablit le compte dans les 30 jours', () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const jobs = recordingQueue();
      await requestDeletion(ctxFor(tx, alice, { jobs, clock: fixedClock(NOW) }), { confirmTransferToMember: false });
      const link = jobs.jobs.find((j) => j.data.to === alice.email)?.data.text.match(/\/retablissement\/(\S+)/)?.[1] ?? '';
      expect(link).not.toBe('');
      await expect(restoreAccount(tx, signPayload(`restore:${alice.id}:1`, testEnv().BETTER_AUTH_SECRET ?? ''), NOW)).rejects.toMatchObject({ code: 'NOT_FOUND' });
      await restoreAccount(tx, link, new Date(NOW.getTime() + 5 * 86_400_000));
      const [p] = await tx.select({ at: userProfile.deletionRequestedAt, pseudo: userProfile.pseudo }).from(userProfile).where(eq(userProfile.userId, alice.id));
      expect(p).toEqual({ at: null, pseudo: alice.name });
    }));
});

describe('contrat du moteur', () => {
  it('[RCO-10] une implémentation factice de RecommendationEngine alimente la vue /recommandations sans modification', () =>
    inTx(async (tx) => {
      const { provideEngine, recommendationView } = await import('../../src/features/reco/view');
      const alice = await makeUser(tx);
      const gardenId = await makeGarden(tx, alice);
      const zoneId = await makeZone(tx, alice, gardenId, 'Planche 1');
      const calls: unknown[] = [];
      const restore = provideEngine(() => ({
        version: 'factice-1',
        async recommendVarieties(q) {
          calls.push(q);
          const base = { speciesId: RHUBARBE, speciesName: 'Rhubarbe', score: 0.9 };
          const summary = { koppen: 'Cfb', environment: 'open_air' as const, altitudeM: 100, practices: [] };
          return [
            { ...base, explanation: { source: 'community' as const, confidence: 'high' as const, gardensCount: 20, resultsCount: 40, meanSuccessPct: 78, medianYieldKgM2: 2.1, contextSummary: summary, warnings: [] } },
            { ...base, speciesId: 'autre', explanation: { source: 'reference' as const, confidence: 'cold_start' as const, gardensCount: 3, resultsCount: 3, contextSummary: summary, warnings: [] } },
          ];
        },
        async adjustedCalendar() { return { reference: null, adjusted: null, offsetDays: null, gardensCount: 0, label: 'reference' as const }; },
        async compareMethods() { return []; },
      }));
      try {
        const scope = (await scopedCtx(tx, alice, gardenId)).scope;
        const view = await recommendationView(tx, scope, { zoneId, period: 'spring', year: 2026 });
        expect(view.version).toBe('factice-1');
        expect(view.items.map((i) => i.speciesId)).toEqual([RHUBARBE]);
        expect(view.coldStart.map((i) => i.speciesId)).toEqual(['autre']);
        expect(calls[0]).toMatchObject({ gardenId, zoneId, from: new Date('2026-03-01T00:00:00Z'), to: new Date('2026-05-31T00:00:00Z') });
      } finally {
        restore();
      }
    }));
});

describe('archives d\'export (audit lot 5, M1)', () => {
  function memFiles() {
    const files = new Map<string, Uint8Array>();
    return { files, put: async (k: string, d: Uint8Array) => void files.set(k, d), get: async (k: string) => files.get(k) ?? null, remove: async (k: string) => void files.delete(k) };
  }

  it('[PRV-07] l\'archive est effacée à l\'expiration (7 jours) et à la purge du compte', () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const store = memFiles();
      const at = (days: number) => fixedClock(new Date(NOW.getTime() + days * 86_400_000));
      const { exportId } = await requestExport(ctxFor(tx, alice));
      await buildExport({ tx, clock: at(0), jobs: recordingQueue(), appUrl: 'http://x' }, exportId, store);
      expect(store.files.size).toBe(1);
      await expect(readExport(tx, alice.id, exportId, store, new Date(NOW.getTime() + 6 * 86_400_000))).resolves.toBeInstanceOf(Uint8Array);
      expect(await purgeExpiredExports(tx, store, new Date(NOW.getTime() + 6 * 86_400_000))).toBe(0);
      expect(await purgeExpiredExports(tx, store, new Date(NOW.getTime() + 8 * 86_400_000))).toBe(1);
      expect(store.files.size).toBe(0);
      // Un nouvel export, puis la suppression du compte : l'archive disparaît à la purge, avant toute expiration.
      const { exportId: second } = await requestExport(ctxFor(tx, alice, { clock: at(9) }));
      await buildExport({ tx, clock: at(9), jobs: recordingQueue(), appUrl: 'http://x' }, second, store);
      await requestDeletion(ctxFor(tx, alice, { clock: at(9) }), { confirmTransferToMember: false });
      await purgeDeletedAccounts(tx, store, new Date(NOW.getTime() + 40 * 86_400_000));
      expect(store.files.size).toBe(0);
    }));
});

describe('alertes groupées du moteur (audit lot 5, M2)', () => {
  it('[RCO-08] rotation et associations groupées identiques à l\'aperçu de culture', () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const gardenId = await makeGarden(tx, alice);
      const zoneId = await makeZone(tx, alice, gardenId, 'Planche 1');
      const ctx = await scopedCtx(tx, alice, gardenId);
      await createCulture(ctx, { gardenId, zoneId, speciesId: speciesRefId('tomate'), method: 'bought_plants', anchorDate: '2025-05-15', seedSource: 'bought', plannedDates: {}, acknowledgeRotation: true });
      const items = ['tomate', 'pomme-de-terre', 'laitue', 'haricot'].map((code) => ({ speciesId: speciesRefId(code), method: 'bought_plants' as const }));
      const batch = await zoneWarningsBatch(tx, ctx.scope, zoneId, items, '2026-05-15');
      for (const it of items) {
        const p = await previewCulture(tx, ctx.scope, { gardenId, zoneId, speciesId: it.speciesId, method: it.method, anchorDate: '2026-05-15' });
        expect(batch.get(`${it.speciesId}|${it.method}`)).toEqual({ rotation: p.rotation !== null, unfavorable: p.companions.some((c) => c.effect === 'unfavorable') });
      }
      expect(batch.get(`${speciesRefId('tomate')}|bought_plants`)?.rotation).toBe(true);
    }));
});

describe('bornes de date du RGPD (délégations D1 et D3)', () => {
  const DAY = 86_400_000;
  it('[PRV-09] le rétablissement est accepté à J+30 − 1 ms et refusé à J+30 + 1 ms', () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const jobs = recordingQueue();
      await requestDeletion(ctxFor(tx, alice, { jobs }), { confirmTransferToMember: false });
      const token = jobs.jobs[0]?.data.text.match(/\/retablissement\/(\S+)/)?.[1] ?? '';
      await expect(restoreAccount(tx, token, new Date(NOW.getTime() + 30 * DAY + 1))).rejects.toMatchObject({ code: 'NOT_FOUND' });
      await expect(restoreAccount(tx, token, new Date(NOW.getTime() + 30 * DAY - 1))).resolves.toMatchObject({ userId: alice.id });
    }));

  it('[PRV-07] un export par 24 heures : refusé à 24 h − 1 ms, accepté à 24 h', () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const at = (ms: number) => ctxFor(tx, alice, { clock: fixedClock(new Date(NOW.getTime() + ms)) });
      await requestExport(at(0));
      await expect(requestExport(at(DAY - 1))).rejects.toMatchObject({ code: 'RATE_LIMITED' });
      await expect(requestExport(at(DAY))).resolves.toMatchObject({ exportId: expect.any(String) });
    }));
});
