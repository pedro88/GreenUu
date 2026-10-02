import { sql } from 'drizzle-orm';
import { check, date, index, integer, jsonb, numeric, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { GOAL_METRICS, QUEST_KINDS, QUEST_SOURCES, QUEST_STATUSES, SKILL_DOMAINS, XP_REASONS } from '@/lib/enums';
import { createdAt, id, timestamps, tz } from './_columns';
import { user } from './auth';
import { cultureStage } from './culture';
import { domainEvent } from './event';
import { garden, gardenGroup } from './garden';
import { ticket } from './ticket';

/* Progression (SPEC §4.2.5, §8). Journal d'XP append-only ; `user_progress` n'en est qu'une projection. */

export const xpLedgerEntry = pgTable(
  'xp_ledger_entry',
  {
    id: id(),
    userId: uuid('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    gardenId: uuid('garden_id'),
    eventId: uuid('event_id').references(() => domainEvent.id, { onDelete: 'set null' }),
    actionCode: text('action_code').notNull(),
    amount: integer('amount').notNull(),
    skillPrimary: text('skill_primary', { enum: SKILL_DOMAINS }),
    skillSecondary: text('skill_secondary', { enum: SKILL_DOMAINS }),
    reason: text('reason', { enum: XP_REASONS }).notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    reversesEntryId: uuid('reverses_entry_id').references((): AnyPgColumn => xpLedgerEntry.id),
    /** Contenu à l'origine du gain et sa culture : retrouver les gains liés lors d'une suppression (RG-XP-02). */
    subjectId: uuid('subject_id'),
    cultureId: uuid('culture_id'),
    localDay: date('local_day', { mode: 'string' }).notNull(),
    rulesVersion: integer('rules_version').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('xp_ledger_idempotency_uq').on(t.idempotencyKey),
    index('xp_ledger_user_day_idx').on(t.userId, t.localDay, t.actionCode),
    index('xp_ledger_user_created_idx').on(t.userId, t.createdAt),
    index('xp_ledger_garden_idx').on(t.gardenId),
    index('xp_ledger_subject_idx').on(t.subjectId),
    index('xp_ledger_culture_idx').on(t.cultureId),
    index('xp_ledger_event_idx').on(t.eventId),
    index('xp_ledger_reverses_idx').on(t.reversesEntryId),
  ],
);

export const userProgress = pgTable('user_progress', {
  userId: uuid('user_id').primaryKey().references(() => user.id, { onDelete: 'cascade' }),
  totalXp: integer('total_xp').notNull().default(0),
  /** Maximum historique : un recalcul ne fait jamais baisser le niveau affiché (RG-XP-08, LVL-02). */
  level: integer('level').notNull().default(1),
  skills: jsonb('skills').$type<Partial<Record<(typeof SKILL_DOMAINS)[number], number>>>().notNull().default({}),
  recomputedAt: tz('recomputed_at'),
  ...timestamps(),
});

export const userAchievement = pgTable(
  'user_achievement',
  {
    userId: uuid('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    achievementCode: text('achievement_code').notNull(),
    gardenId: uuid('garden_id').references(() => garden.id, { onDelete: 'set null' }),
    earnedAt: tz('earned_at').notNull(),
    evidence: jsonb('evidence').$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [primaryKey({ columns: [t.userId, t.achievementCode] })],
);

export const quest = pgTable(
  'quest',
  {
    id: id(),
    userId: uuid('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    gardenId: uuid('garden_id').references(() => garden.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: QUEST_KINDS }).notNull(),
    source: text('source', { enum: QUEST_SOURCES }).notNull(),
    ticketId: uuid('ticket_id').references(() => ticket.id, { onDelete: 'set null' }),
    stageId: uuid('stage_id').references(() => cultureStage.id, { onDelete: 'set null' }),
    cultureId: uuid('culture_id'),
    templateCode: text('template_code'),
    /** Texte de la quête : clé i18n et paramètres (titre de ticket, espèce…). */
    titleKey: text('title_key').notNull(),
    titleParams: jsonb('title_params').$type<Record<string, string | number>>().notNull().default({}),
    target: integer('target').notNull().default(1),
    progress: integer('progress').notNull().default(0),
    periodStart: date('period_start', { mode: 'string' }).notNull(),
    periodEnd: date('period_end', { mode: 'string' }).notNull(),
    status: text('status', { enum: QUEST_STATUSES }).notNull().default('open'),
    completedAt: tz('completed_at'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('quest_unique_per_period').on(t.userId, t.kind, t.periodStart, sql`coalesce(${t.ticketId}::text, ${t.stageId}::text, ${t.cultureId}::text, ${t.templateCode})`),
    index('quest_user_status_idx').on(t.userId, t.status),
    index('quest_ticket_idx').on(t.ticketId),
    index('quest_stage_idx').on(t.stageId),
  ],
);

export const gardenGoal = pgTable(
  'garden_goal',
  {
    id: id(),
    gardenId: uuid('garden_id').notNull().references(() => garden.id, { onDelete: 'cascade' }),
    groupId: uuid('group_id').references(() => gardenGroup.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    metric: text('metric', { enum: GOAL_METRICS }).notNull(),
    target: numeric('target', { precision: 10, scale: 2, mode: 'number' }).notNull(),
    periodStart: date('period_start', { mode: 'string' }).notNull(),
    periodEnd: date('period_end', { mode: 'string' }).notNull(),
    createdBy: uuid('created_by').notNull().references(() => user.id),
    archivedAt: tz('archived_at'),
    ...timestamps(),
  },
  (t) => [check('goal_period', sql`${t.periodStart} <= ${t.periodEnd}`), check('goal_target_positive', sql`${t.target} > 0`), index('garden_goal_garden_idx').on(t.gardenId), index('garden_goal_group_idx').on(t.groupId)],
);

/** Saisies en masse (RG-XP-07) : fenêtre signalée dans `/admin/xp`. */
export const xpFlag = pgTable(
  'xp_flag',
  {
    id: id(),
    userId: uuid('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    windowStart: tz('window_start').notNull(),
    events: integer('events').notNull(),
    reviewedAt: tz('reviewed_at'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('xp_flag_user_window_uq').on(t.userId, t.windowStart), index('xp_flag_open_idx').on(t.createdAt).where(sql`${t.reviewedAt} is null`)],
);
