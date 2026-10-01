import { optionalNumber, optionalText, uuidSchema, z } from '@/lib/zod';
import { METHODS, SEED_SOURCES, STAGES } from '@/lib/enums';

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

export const cultureCreateSchema = culturePreviewSchema.extend({
  varietyId: optionalUuid,
  plantCount: optionalNumber(z.number().int().min(1).max(100_000)),
  areaM2: optionalNumber(z.number().positive().max(1_000_000)),
  seedSource: z.enum(SEED_SOURCES).default('unknown'),
  seedParentCultureId: optionalUuid,
  notes: optionalText(2000),
  plannedDates: z.partialRecord(z.enum(STAGES), isoDate).default({}),
  acknowledgeRotation: z.boolean().default(false),
});
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
  notes: optionalText(2000),
});

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
