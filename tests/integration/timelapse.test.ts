import { describe, expect, it } from 'vitest';
import { createCulture } from '../../src/features/culture/service';
import { cultureCreateSchema } from '../../src/features/culture/schema';
import { gardenHistory } from '../../src/features/scene/timelapse';
import { historyBounds, sceneAt } from '../../src/features/scene/timelapse.pure';
import { setZoneArchived } from '../../src/features/zone/service';
import { loadScope } from '../../src/server/authz/scope';
import { fixedClock } from '../../src/server/clock';
import { makeGarden, makeZone, speciesRefId } from './fixtures';
import { inTx, makeUser, scopedCtx } from './helpers';

/* Histoire du jardin (SPEC §12.11) : données lues en base, images calculées. */

const rect = (x: number, y: number, w: number, h: number) => ({ v: 1 as const, kind: 'rect' as const, x, y, w, h });
const day = (iso: string) => new Date(`${iso}T10:00:00Z`);

describe('histoire du jardin', () => {
  it('[TLP-04] une zone archivée en juin disparaît à partir de juin, avec ses cultures', () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const gardenId = await makeGarden(tx, alice);
      // Planche créée le 15 juin (instantané du jour), tomates plantées le 1er mai, planche archivée le 20 juin.
      const planche = await makeZone(tx, alice, gardenId, 'Planche 1', 'bed', null, rect(0, 0, 200, 100));
      const ctx = await scopedCtx(tx, alice, gardenId);
      await createCulture(ctx, cultureCreateSchema.parse({ gardenId, zoneId: planche, speciesId: speciesRefId('tomate'), method: 'bought_plants', anchorDate: '2026-05-01', seedSource: 'unknown', plannedDates: {}, acknowledgeRotation: true }));
      await setZoneArchived(await scopedCtx(tx, alice, gardenId, { clock: fixedClock(day('2026-06-20')) }), planche, true, { finishActiveCultures: true });
      const data = await gardenHistory(tx, ctx.scope, day('2026-07-01'));
      expect(data.snapshots.map((s) => s.takenOn)).toEqual(['2026-06-15', '2026-06-20']);
      const bounds = historyBounds(data);
      const june18 = sceneAt(data, '2026-06-18', { bounds, reducedMotion: true }).scene;
      expect(june18.zones.map((z) => z.id)).toEqual([planche]);
      expect(june18.cultures).toHaveLength(1);
      const june25 = sceneAt(data, '2026-06-25', { bounds, reducedMotion: true }).scene;
      expect(june25.zones).toEqual([]);
      expect(june25.cultures).toEqual([]);
    }));

  it('[TLP-05] un utilisateur qui n\'est pas membre du jardin n\'a pas de portée : la page répond 403', () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const outsider = await makeUser(tx);
      const gardenId = await makeGarden(tx, alice);
      // `requireGardenScope` (page) répond 403 (`forbidden()`) quand `loadScope` ne trouve pas de portée.
      expect(await loadScope(tx, outsider.id, gardenId)).toBeNull();
      expect(await loadScope(tx, alice.id, gardenId)).not.toBeNull();
    }));
});
