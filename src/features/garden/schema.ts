import { createInsertSchema } from 'drizzle-zod';
import { optionalNumber, optionalText, uuidSchema, z } from '@/lib/zod';
import { isValidTimeZone } from '@/lib/dates';
import { ENVIRONMENTS, EXPOSURES, garden, ORG_TYPES, SOIL_TYPES, WATER_ACCESS } from '@/server/db/schema';

/** Base générée depuis Drizzle, puis raffinée (SPEC §3.1). */
const base = createInsertSchema(garden, {
  name: (s) => s.trim().min(2).max(80),
  lat: () => z.coerce.number().min(-90).max(90),
  lng: () => z.coerce.number().min(-180).max(180),
});

const contextFields = {
  placeLabel: optionalText(120),
  altitudeM: optionalNumber(z.number().int().min(-500).max(9000)),
  koppen: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.string().regex(/^(A[fmws]|B[WS][hk]|C[sfw][abc]|D[sfw][abcd]|E[TF])$/, 'invalidKoppen').optional(),
  ),
  hardinessZone: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.string().regex(/^(1[0-3]|[1-9])[ab]?$/, 'invalidHardiness').optional(),
  ),
  soilType: z.preprocess((v) => (v === '' ? undefined : v), z.enum(SOIL_TYPES).default('unknown')),
  soilPh: optionalNumber(z.number().min(3).max(10)),
  exposure: z.preprocess((v) => (v === '' ? undefined : v), z.enum(EXPOSURES).optional()),
  waterAccess: z.preprocess((v) => (v === '' ? undefined : v), z.enum(WATER_ACCESS).optional()),
};

export const gardenCreateSchema = base
  .pick({ name: true, lat: true, lng: true })
  .extend({
    orgType: z.enum(ORG_TYPES),
    environments: z.array(z.enum(ENVIRONMENTS)).min(1).max(ENVIRONMENTS.length)
      .refine((a) => new Set(a).size === a.length, 'duplicate'),
    timezone: z.string().refine(isValidTimeZone, 'invalidTimezone'),
    ...contextFields,
  });
export type GardenCreateInput = z.output<typeof gardenCreateSchema>;

export const gardenUpdateSchema = gardenCreateSchema.extend({
  gardenId: uuidSchema,
  seasonStartMonth: z.coerce.number().int().min(1).max(12),
  planEditMinRole: z.enum(['admin', 'member']),
});
export type GardenUpdateInput = z.output<typeof gardenUpdateSchema>;

export const gardenIdSchema = z.object({ gardenId: uuidSchema });

export const gardenDeleteSchema = z.object({ gardenId: uuidSchema, confirmName: z.string() });

export const gardenTransferSchema = z.object({ gardenId: uuidSchema, toMemberId: uuidSchema });
