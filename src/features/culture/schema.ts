import { optionalNumber, optionalText, uuidSchema, z } from '@/lib/zod';
import { DENSITY_UNITS, METHODS, SEED_SOURCES, STAGES } from '@/lib/enums';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'invalidDate');
const optionalDate = z.preprocess((v) => (v === '' ? undefined : v), isoDate.optional());
const optionalUuid = z.preprocess((v) => (v === '' ? undefined : v), uuidSchema.optional());

export const culturePreviewSchema = z.object({
  gardenId: uuidSchema,
  zoneId: uuidSchema,
  speciesId: uuidSchema,
  method: z.enum(METHODS),
  anchorDate: isoDate,
});
export type CulturePreviewInput = z.output<typeof culturePreviewSchema>;

export const plannedDatesSchema = z.partialRecord(z.enum(STAGES), isoDate).default({});

/**
 * Distances ou densité de plantation et de semis (RG-CUL-06, lot 9). La densité exige son unité, et inversement ; les
 * graines par mètre de rang ne valent que pour un semis en place.
 */
const spacing = {
  spacingPlantCm: optionalNumber(z.number().int().min(1).max(1000)),
  spacingRowCm: optionalNumber(z.number().int().min(1).max(1000)),
  density: optionalNumber(z.number().positive().max(100_000)),
  densityUnit: z.preprocess((v) => (v === '' ? undefined : v), z.enum(DENSITY_UNITS).optional()),
};
type SpacingInput = { density?: number | undefined; densityUnit?: (typeof DENSITY_UNITS)[number] | undefined; method?: string };
const checkSpacing = (v: SpacingInput, ctx: z.RefinementCtx) => {
  if ((v.density === undefined) !== (v.densityUnit === undefined)) ctx.addIssue({ code: 'custom', path: ['density'], message: 'densityUnitRequired' });
  if (v.densityUnit === 'seeds_per_m' && v.method !== undefined && v.method !== 'direct_sowing') ctx.addIssue({ code: 'custom', path: ['densityUnit'], message: 'seedsPerMeterNeedsSowing' });
};

export const cultureCreateSchema = culturePreviewSchema.extend({
  varietyId: optionalUuid,
  plantCount: optionalNumber(z.number().int().min(1).max(100_000)),
  areaM2: optionalNumber(z.number().positive().max(1_000_000)),
  ...spacing,
  seedSource: z.enum(SEED_SOURCES).default('unknown'),
  seedParentCultureId: optionalUuid,
  notes: optionalText(2000),
  plannedDates: plannedDatesSchema,
  acknowledgeRotation: z.boolean().default(false),
}).superRefine(checkSpacing);
export type CultureCreateInput = z.output<typeof cultureCreateSchema>;

export const stageRecordSchema = z.object({
  gardenId: uuidSchema,
  cultureId: uuidSchema,
  stage: z.enum(STAGES),
  plannedOn: z.preprocess((v) => (v === '' ? null : v), isoDate.nullable().optional()),
  actualOn: z.preprocess((v) => (v === '' ? null : v), isoDate.nullable().optional()),
  /** Repiquage / plantation vers une autre zone (RG-CUL-03, CUL-08). */
  targetZoneId: optionalUuid,
});
export type StageRecordInput = z.output<typeof stageRecordSchema>;

export const cultureUpdateSchema = z.object({
  gardenId: uuidSchema,
  cultureId: uuidSchema,
  varietyId: z.preprocess((v) => (v === '' ? null : v), uuidSchema.nullable()),
  plantCount: optionalNumber(z.number().int().min(1).max(100_000)),
  areaM2: optionalNumber(z.number().positive().max(1_000_000)),
  ...spacing,
  notes: optionalText(2000),
}).superRefine(checkSpacing);

export const cultureOutcomeSchema = z.object({
  gardenId: uuidSchema,
  cultureId: uuidSchema,
  outcome: z.enum(['failed', 'abandoned']),
  on: optionalDate,
});

export const cultureRefSchema = z.object({ gardenId: uuidSchema, cultureId: uuidSchema });

export const cultureFiltersSchema = z.object({
  season: optionalNumber(z.number().int().min(1900).max(3000)),
  zone: optionalUuid,
  species: optionalUuid,
  status: z.preprocess((v) => (v === '' ? undefined : v), z.enum(['planned', 'active', 'finished', 'failed', 'abandoned']).optional()),
});
export type CultureFilters = z.output<typeof cultureFiltersSchema>;
