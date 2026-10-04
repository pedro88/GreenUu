import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import '../../src/features/stats/actions';
import { createCulture } from '../../src/features/culture/service';
import { recordHarvest } from '../../src/features/harvest/service';
import { gardenStats } from '../../src/features/stats/service';
import { actionRegistry, runAction, type ActionDeps } from '../../src/server/action-core';
import { fixedClock } from '../../src/server/clock';
import type { Tx } from '../../src/server/db/client';
import { culture } from '../../src/server/db/schema';
import { addMember, makeGarden, makeZone, speciesRefId } from './fixtures';
import { inTx, makeUser, NOW, recordingQueue, scopedCtx } from './helpers';

const deps = (tx: Tx): ActionDeps => ({ db: tx, clock: fixedClock(NOW), appUrl: 'http://localhost:3000', jobs: () => recordingQueue() });
const rect = (x: number, y: number, w: number, h: number) => ({ v: 1 as const, kind: 'rect' as const, x, y, w, h });

describe('statistiques (§12.10)', () => {
  it('[STAT-06] taux de réussite par espèce et par saison ; les cultures en cours n\'entrent pas dans le calcul', () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const gardenId = await makeGarden(tx, alice);
      const ctx = await scopedCtx(tx, alice, gardenId);
      const bed = await makeZone(tx, alice, gardenId, 'Planche 1', 'bed', null, rect(0, 0, 200, 200));
      const make = async () => (await createCulture(ctx, { gardenId, zoneId: bed, speciesId: speciesRefId('tomate'), method: 'bought_plants', anchorDate: '2026-05-10', seedSource: 'bought', plannedDates: {}, acknowledgeRotation: true })).cultureId;
      const ids = [await make(), await make(), await make(), await make()];
      const statuses = ['finished', 'finished', 'failed', 'active'] as const;
      for (const [i, id] of ids.entries()) await tx.update(culture).set({ status: statuses[i] }).where(eq(culture.id, id));
      // Une récolte de 2 kg sur la planche de 4 m².
      await recordHarvest(ctx, { gardenId, cultureId: ids[0] ?? '', harvestedOn: '2026-06-10', quantity: 2, unit: 'kg', seedSaving: false });
      const s = await gardenStats(tx, ctx.scope);
      const tomate = s.success.find((x) => x.id === speciesRefId('tomate'));
      expect(tomate?.perSeason.get(2026)).toEqual({ finished: 2, failed: 1, abandoned: 0, rate: 67 });
      expect(s.byZone.find((z) => z.id === bed)?.perSeason.get(2026)).toMatchObject({ kg: 2, kgPerM2: 0.5 });
    }));

  it('[STAT-07] l\'export CSV est remis à l\'admin et refusé au membre (garden:export)', () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const gardenId = await makeGarden(tx, alice, { orgType: 'collective' });
      const chloe = await makeUser(tx);
      const david = await makeUser(tx);
      await addMember(tx, gardenId, chloe, 'admin');
      await addMember(tx, gardenId, david, 'member');
      const def = actionRegistry.get('stats.export');
      if (!def) throw new Error('stats.export');
      const ok = await runAction(def, chloe, { gardenId }, deps(tx));
      expect(ok).toMatchObject({ ok: true, data: { filename: expect.stringMatching(/^statistiques-.+\.csv$/), csv: expect.stringContaining('saison;espece;zone;kg') } });
      expect(await runAction(def, david, { gardenId }, deps(tx))).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    }));
});
