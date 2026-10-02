import { optionalText, uuidSchema, z } from '@/lib/zod';
import { ACTION_TAGS, TICKET_PRIORITIES, TICKET_STATUSES, TICKET_TYPES } from '@/lib/enums';
import { validateRrule } from './rules.pure';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'invalidDate');
const emptyToUndefined = (v: unknown) => (v === '' || v === null ? undefined : v);

const ticketFields = {
  type: z.enum(TICKET_TYPES),
  actionTag: z.preprocess(emptyToUndefined, z.enum(ACTION_TAGS).optional()),
  title: z.string().trim().min(3).max(140),
  description: optionalText(10_000),
  priority: z.enum(TICKET_PRIORITIES).default('normal'),
  dueOn: z.preprocess(emptyToUndefined, isoDate.optional()),
};

export const recurrenceSchema = z.object({
  rrule: z.string().max(200).transform((r, ctx) => {
    const v = validateRrule(r);
    if (!v) ctx.addIssue({ code: 'custom', message: 'invalidRrule' });
    return v ?? '';
  }),
  dtstart: isoDate,
  until: z.preprocess(emptyToUndefined, isoDate.optional()),
  skipMissed: z.boolean().default(true),
});

export const ticketCreateSchema = z.object({
  gardenId: uuidSchema,
  zoneId: z.preprocess(emptyToUndefined, uuidSchema.optional()),
  cultureId: z.preprocess(emptyToUndefined, uuidSchema.optional()),
  ...ticketFields,
  checklist: z.array(z.string().trim().min(1).max(200)).max(50).default([]),
  memberIds: z.array(uuidSchema).max(50).default([]),
  groupIds: z.array(uuidSchema).max(20).default([]),
  recurrence: recurrenceSchema.optional(),
}).refine((v) => !(v.zoneId && v.cultureId), { message: 'oneTarget', path: ['zoneId'] });
export type TicketCreateInput = z.output<typeof ticketCreateSchema>;

export const ticketUpdateSchema = z.object({
  gardenId: uuidSchema,
  ticketId: uuidSchema,
  ...ticketFields,
  /** Occurrence récurrente : cette occurrence seulement, ou celle-ci et les suivantes (RG-TCK-09). */
  applyTo: z.enum(['this', 'following']).default('this'),
});
export type TicketUpdateInput = z.output<typeof ticketUpdateSchema>;

export const ticketRefSchema = z.object({ gardenId: uuidSchema, ticketId: uuidSchema });
export const ticketTransitionSchema = ticketRefSchema.extend({ status: z.enum(TICKET_STATUSES) });
export const ticketAssignSchema = ticketRefSchema.extend({ memberIds: z.array(uuidSchema).max(50), groupIds: z.array(uuidSchema).max(20) });
export const checklistToggleSchema = z.object({ gardenId: uuidSchema, itemId: uuidSchema, done: z.boolean() });
export const checklistAddSchema = ticketRefSchema.extend({ label: z.string().trim().min(1).max(200) });
export const commentSchema = ticketRefSchema.extend({ body: z.string().trim().min(1).max(4000) });
export const seriesRefSchema = z.object({ gardenId: uuidSchema, seriesId: uuidSchema });

export const ticketFiltersSchema = z.object({
  vue: z.preprocess(emptyToUndefined, z.enum(['liste', 'kanban', 'calendrier']).optional()),
  statut: z.preprocess(emptyToUndefined, z.enum(['ouverts', 'termines', 'tous']).optional()),
  type: z.preprocess(emptyToUndefined, z.enum(TICKET_TYPES).optional()),
  assigne: z.preprocess(emptyToUndefined, z.union([z.literal('moi'), uuidSchema]).optional()),
  groupe: z.preprocess(emptyToUndefined, uuidSchema.optional()),
  zone: z.preprocess(emptyToUndefined, uuidSchema.optional()),
  culture: z.preprocess(emptyToUndefined, uuidSchema.optional()),
  niveau: z.preprocess(emptyToUndefined, z.enum(['garden', 'zone', 'culture']).optional()),
  echeance: z.preprocess(emptyToUndefined, z.enum(['retard', 'aujourdhui', 'semaine', 'avenir', 'sans']).optional()),
  priorite: z.preprocess(emptyToUndefined, z.enum(TICKET_PRIORITIES).optional()),
  mois: z.preprocess(emptyToUndefined, z.string().regex(/^\d{4}-\d{2}$/).optional()),
});
export type TicketFilters = z.output<typeof ticketFiltersSchema>;
