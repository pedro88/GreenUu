import { optionalNumber, optionalText, uuidSchema, z } from '@/lib/zod';
import { INTERVENTIONS, JOURNAL_KINDS } from '@/lib/enums';

export const journalCreateSchema = z.object({
  gardenId: uuidSchema,
  cultureId: uuidSchema.optional(),
  zoneId: uuidSchema.optional(),
  kind: z.enum(JOURNAL_KINDS),
  observedAt: z.preprocess((v) => (v === '' ? undefined : v), z.iso.datetime({ offset: true }).optional()),
  body: optionalText(4000),
  problemCode: z.preprocess((v) => (v === '' ? undefined : v), z.string().max(60).optional()),
  problemOther: optionalText(120),
  severity: optionalNumber(z.number().int().min(1).max(3)),
  intervention: z.preprocess((v) => (v === '' ? undefined : v), z.enum(INTERVENTIONS).optional()),
  weather: z.object({
    tempC: z.number().min(-40).max(60).optional(),
    conditions: z.enum(['sun', 'clouds', 'rain', 'frost', 'wind', 'heat', 'snow']).optional(),
  }).optional(),
  attachmentIds: z.array(uuidSchema).max(6).default([]),
}).refine((v) => (v.cultureId ? 1 : 0) + (v.zoneId ? 1 : 0) === 1, { message: 'oneTarget', path: ['cultureId'] });
export type JournalCreateInput = z.output<typeof journalCreateSchema>;

export const journalRefSchema = z.object({ gardenId: uuidSchema, entryId: uuidSchema });
