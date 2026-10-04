import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { cultureDetail } from '../../src/features/culture/queries';
import { cultureCreateSchema } from '../../src/features/culture/schema';
import { createCulture } from '../../src/features/culture/service';
import { culture } from '../../src/server/db/schema';
import { makeGarden, makeZone, speciesRefId } from './fixtures';
import { inTx, makeUser, scopedCtx } from './helpers';

/* Distances et densité de plantation et de semis (SPEC RG-CUL-06, lot 9). */

const base = (gardenId: string, zoneId: string) => ({
  gardenId, zoneId, speciesId: speciesRefId('tomate'), method: 'bought_plants', anchorDate: '2026-05-10', seedSource: 'unknown', plannedDates: {}, acknowledgeRotation: true,
});

describe('plantation', () => {
  it('[PLA-03] densité sans unité ou graines par mètre pour une plantation : VALIDATION ; les distances de la culture priment sur celles de l\'espèce', () =>
    inTx(async (tx) => {
      const alice = await makeUser(tx);
      const gardenId = await makeGarden(tx, alice);
      const zoneId = await makeZone(tx, alice, gardenId, 'Planche 1');
      expect(cultureCreateSchema.safeParse({ ...base(gardenId, zoneId), density: '9' }).success).toBe(false);
      expect(cultureCreateSchema.safeParse({ ...base(gardenId, zoneId), density: '40', densityUnit: 'seeds_per_m' }).success).toBe(false);
      expect(cultureCreateSchema.safeParse({ ...base(gardenId, zoneId), method: 'direct_sowing', density: '40', densityUnit: 'seeds_per_m', spacingRowCm: '25' }).success).toBe(true);

      // Tomates plantées serrées (40 × 60 cm au lieu des 50 × 80 de l'espèce), 2 m² : 8 plants estimés.
      const ctx = await scopedCtx(tx, alice, gardenId);
      const { cultureId } = await createCulture(ctx, cultureCreateSchema.parse({ ...base(gardenId, zoneId), spacingPlantCm: '40', spacingRowCm: '60', areaM2: '2' }));
      const [row] = await tx.select().from(culture).where(eq(culture.id, cultureId));
      expect(row).toMatchObject({ spacingPlantCm: 40, spacingRowCm: 60, density: null, densityUnit: null, plantCount: 8, areaM2: 2 });
      // Sans surface saisie, la surface déduite du nombre de plants utilise les distances de la culture.
      const second = await createCulture(ctx, cultureCreateSchema.parse({ ...base(gardenId, zoneId), anchorDate: '2026-05-11', spacingPlantCm: '40', spacingRowCm: '60', plantCount: '10' }));
      const d = await cultureDetail(tx, ctx.scope, second.cultureId);
      expect(d.area).toEqual({ m2: 2.4, source: 'spacing' });
      expect(d.planting).toMatchObject({ spacingPlantCm: 40, spacingRowCm: 60 });
      // Sans rien saisir : les distances de l'espèce (50 × 80 cm).
      const third = await createCulture(ctx, cultureCreateSchema.parse({ ...base(gardenId, zoneId), anchorDate: '2026-05-12', areaM2: '2' }));
      const [t] = await tx.select({ plantCount: culture.plantCount, spacing: culture.spacingPlantCm }).from(culture).where(eq(culture.id, third.cultureId));
      expect(t).toEqual({ plantCount: 5, spacing: null });
    }));
});
