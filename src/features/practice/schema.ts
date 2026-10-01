import { uuidSchema, z } from '@/lib/zod';

export const practiceSetSchema = z.object({
  gardenId: uuidSchema,
  zoneId: uuidSchema.nullable().default(null),
  /** Codes déclarés à ce niveau ; les autres codes passés dans `excluded` désactivent une pratique héritée. */
  declared: z.array(z.string().min(2).max(60)).max(50),
  excluded: z.array(z.string().min(2).max(60)).max(50).default([]),
});
export type PracticeSetInput = z.output<typeof practiceSetSchema>;
