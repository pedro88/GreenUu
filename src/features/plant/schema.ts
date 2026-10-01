import { optionalText, uuidSchema, z } from '@/lib/zod';
import { VARIETY_ORIGINS } from '@/lib/enums';

export const varietyProposeSchema = z.object({
  speciesId: uuidSchema,
  gardenId: uuidSchema,
  name: z.string().trim().min(2).max(60),
  origin: z.enum(VARIETY_ORIGINS).default('local'),
  description: optionalText(1000),
});
export type VarietyProposeInput = z.output<typeof varietyProposeSchema>;

export const varietyModerateSchema = z.discriminatedUnion('decision', [
  z.object({ varietyId: uuidSchema, decision: z.literal('approve'), note: optionalText(500) }),
  z.object({ varietyId: uuidSchema, decision: z.literal('reject'), note: optionalText(500) }),
  z.object({ varietyId: uuidSchema, decision: z.literal('merge'), targetId: uuidSchema, note: optionalText(500) }),
]);
export type VarietyModerateInput = z.output<typeof varietyModerateSchema>;
