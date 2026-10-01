import { sql } from 'drizzle-orm';
import { index, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { createdAt, id, tz } from './_columns';
import { user } from './auth';

/** Outbox des événements de domaine (SPEC §3.5). Table append-only (trigger). */
export const domainEvent = pgTable(
  'domain_event',
  {
    id: id(),
    type: text('type').notNull(),
    actorId: uuid('actor_id').references(() => user.id),
    /** Pas de FK : l'événement survit à la purge du jardin (journal d'audit et rejeu d'XP). */
    gardenId: uuid('garden_id'),
    subjectType: text('subject_type').notNull(),
    subjectId: uuid('subject_id').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    occurredAt: tz('occurred_at').notNull().defaultNow(),
    dispatchedAt: tz('dispatched_at'),
    createdAt: createdAt(),
  },
  (t) => [
    index('domain_event_undispatched_idx').on(t.occurredAt).where(sql`${t.dispatchedAt} is null`),
    index('domain_event_actor_idx').on(t.actorId, t.occurredAt),
    index('domain_event_garden_idx').on(t.gardenId, t.occurredAt),
    index('domain_event_subject_idx').on(t.subjectType, t.subjectId),
  ],
);
