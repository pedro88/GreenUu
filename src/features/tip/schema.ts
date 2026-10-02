import { optionalText, uuidSchema, z } from '@/lib/zod';
import { REPORT_REASONS } from '@/lib/enums';
import { normalizeTags, TIP_MAX, TIP_MAX_TAGS, TIP_MIN } from './rules.pure';

const emptyToUndefined = (v: unknown) => (v === '' || v === null ? undefined : v);

/** RG-TIP-01 : 10 à 500 caractères, 1 à 5 tags (normalisés), contexte du jardin courant facultatif. */
export const tipCreateSchema = z.object({
  body: z.string().trim().min(TIP_MIN).max(TIP_MAX),
  tags: z.array(z.string().max(40)).transform(normalizeTags).pipe(z.array(z.string()).min(1).max(TIP_MAX_TAGS)),
  speciesId: z.preprocess(emptyToUndefined, uuidSchema.optional()),
  /** Jardin dont on reprend le contexte (geohash4, Köppen, environnement) ; absent = contexte retiré. */
  contextGardenId: z.preprocess(emptyToUndefined, uuidSchema.optional()),
});
export type TipCreateInput = z.output<typeof tipCreateSchema>;

export const tipVoteSchema = z.object({ tipId: uuidSchema, value: z.union([z.literal(1), z.literal(-1), z.literal(0)]) });

export const reportSchema = z.object({
  target: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('guide'), id: uuidSchema }),
    z.object({ kind: z.literal('tip'), id: uuidSchema }),
    z.object({ kind: z.literal('user'), id: uuidSchema }),
  ]),
  reason: z.enum(REPORT_REASONS),
  details: optionalText(1000),
});
export type ReportInput = z.output<typeof reportSchema>;

export const tipFiltersSchema = z.object({
  tag: z.preprocess(emptyToUndefined, z.string().max(40).optional()),
  espece: z.preprocess(emptyToUndefined, uuidSchema.optional()),
  env: z.preprocess(emptyToUndefined, z.string().max(20).optional()),
  jardin: z.preprocess(emptyToUndefined, uuidSchema.optional()),
});
