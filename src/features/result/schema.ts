import { optionalText, uuidSchema, z } from '@/lib/zod';

const nullableInt = (min: number, max: number) => z.preprocess((v) => (v === '' || v === undefined ? null : v), z.number().int().min(min).max(max).nullable());

/** RG-RES-02 : formulaire en un écran ; tout est facultatif, la complétude dit ce qui manque (RG-RES-03). */
export const resultSubmitSchema = z.object({
  gardenId: uuidSchema,
  cultureId: uuidSchema,
  totalKg: z.preprocess((v) => (v === '' || v === undefined ? null : v), z.number().min(0).max(100_000).nullable()),
  noHarvest: z.boolean().default(false),
  quality: nullableInt(1, 5),
  successPct: nullableInt(0, 100),
  rating: nullableInt(1, 5),
  wouldGrowAgain: z.boolean().nullable().default(null),
  /** Problèmes cochés ; `noProblem` vaut revue explicite sans problème. */
  problems: z.array(z.object({ problemId: uuidSchema, severity: z.number().int().min(1).max(3).default(2) })).max(20).default([]),
  noProblem: z.boolean().default(false),
  notes: optionalText(4000),
});
export type ResultSubmitInput = z.output<typeof resultSubmitSchema>;

export const shareResultsSchema = z.object({ gardenId: uuidSchema, enabled: z.boolean(), consentVersion: z.string().max(40).optional() });
