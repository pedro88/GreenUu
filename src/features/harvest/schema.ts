import { optionalNumber, optionalText, uuidSchema, z } from '@/lib/zod';
import { HARVEST_UNITS } from '@/lib/enums';

export const harvestCreateSchema = z.object({
  gardenId: uuidSchema,
  /** Saisie hors-ligne : ID choisi par le client (idempotence, D-15) et instant de saisie (OFF-07). */
  clientId: uuidSchema.optional(),
  capturedAt: z.iso.datetime({ offset: true }).optional(),
  cultureId: uuidSchema,
  harvestedOn: z.preprocess((v) => (v === '' ? undefined : v), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'invalidDate').optional()),
  quantity: z.coerce.number().positive().max(100_000),
  unit: z.enum(HARVEST_UNITS),
  quality: optionalNumber(z.number().int().min(1).max(5)),
  seedSaving: z.boolean().default(false),
  note: optionalText(1000),
});
export type HarvestCreateInput = z.output<typeof harvestCreateSchema>;

export const harvestRefSchema = z.object({ gardenId: uuidSchema, harvestId: uuidSchema });
