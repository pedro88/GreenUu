import { optionalText, uuidSchema, z } from '@/lib/zod';
import { ACTION_TAGS, ENVIRONMENTS, GUIDE_VISIBILITIES, STAGES, TICKET_TYPES } from '@/lib/enums';

const emptyToUndefined = (v: unknown) => (v === '' || v === null ? undefined : v);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'invalidDate');

export const guideContextSchema = z.object({
  v: z.literal(1).default(1),
  koppen: z.array(z.string().regex(/^[A-E][A-Za-z]{0,2}$/)).max(10).optional(),
  environments: z.array(z.enum(ENVIRONMENTS)).max(7).optional(),
  practices: z.array(z.string().max(40)).max(20).optional(),
  altitudeMaxM: z.number().int().min(0).max(6000).optional(),
  hemisphere: z.enum(['N', 'S']).optional(),
});

/** SPEC §4.5 `GuideCalendarV1` ; offsets bornés à ±1 an. */
export const guideCalendarSchema = z.object({
  v: z.literal(1).default(1),
  anchor: z.enum(['sowing', 'planting']),
  stages: z.array(z.object({ stage: z.enum(STAGES), offsetDays: z.number().int().min(-366).max(366) })).max(STAGES.length),
  tasks: z.array(z.object({
    title: z.string().trim().min(3).max(140), type: z.enum(TICKET_TYPES), actionTag: z.enum(ACTION_TAGS).optional(),
    relativeTo: z.enum(STAGES), offsetDays: z.number().int().min(-366).max(366), leadDays: z.number().int().min(0).max(60).optional(),
  })).max(30),
});

/** Brouillon : titre, Markdown (50 000 caractères), contexte et calendrier type facultatif (RG-GUI-01). */
export const guideDraftSchema = z.object({
  title: z.string().trim().min(3).max(140),
  bodyMd: z.string().max(50_000),
  context: guideContextSchema.default({ v: 1 }),
  calendarTemplate: guideCalendarSchema.nullable().default(null),
  changeNote: optionalText(300),
});

export const guideCreateSchema = z.object({
  speciesId: uuidSchema,
  varietyId: z.preprocess(emptyToUndefined, uuidSchema.optional()),
  visibility: z.enum(GUIDE_VISIBILITIES),
  /** Jardin rattaché, obligatoire pour un guide privé (RG-GUI-03). */
  gardenId: z.preprocess(emptyToUndefined, uuidSchema.optional()),
  draft: guideDraftSchema,
}).refine((v) => (v.visibility === 'private') === (v.gardenId !== undefined), { message: 'privateNeedsGarden', path: ['gardenId'] });
export type GuideCreateInput = z.output<typeof guideCreateSchema>;

export const guideUpdateSchema = z.object({
  guideId: uuidSchema,
  visibility: z.enum(GUIDE_VISIBILITIES),
  gardenId: z.preprocess(emptyToUndefined, uuidSchema.optional()),
  varietyId: z.preprocess(emptyToUndefined, uuidSchema.optional()),
  draft: guideDraftSchema,
}).refine((v) => (v.visibility === 'private') === (v.gardenId !== undefined), { message: 'privateNeedsGarden', path: ['gardenId'] });
export type GuideUpdateInput = z.output<typeof guideUpdateSchema>;

export const guideRefSchema = z.object({ guideId: uuidSchema });

/** RG-GUI-05 : application à une culture, avec la date d'ancrage ; `overwrite` tranche les dates prévues déjà renseignées. */
export const guideApplySchema = z.object({
  gardenId: uuidSchema,
  cultureId: uuidSchema,
  guideId: uuidSchema,
  anchorOn: isoDate,
  overwrite: z.boolean().optional(),
});
export type GuideApplyInput = z.output<typeof guideApplySchema>;

export const guideFiltersSchema = z.object({
  q: z.preprocess(emptyToUndefined, z.string().max(100).optional()),
  espece: z.preprocess(emptyToUndefined, uuidSchema.optional()),
  climat: z.preprocess(emptyToUndefined, z.string().max(3).optional()),
  env: z.preprocess(emptyToUndefined, z.enum(ENVIRONMENTS).optional()),
  mes: z.preprocess(emptyToUndefined, z.enum(['1']).optional()),
});
