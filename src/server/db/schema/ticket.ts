import { sql } from 'drizzle-orm';
import { boolean, check, date, foreignKey, index, integer, jsonb, pgTable, primaryKey, text, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { ACTION_TAGS, NOTIFICATION_CHANNELS, NOTIFICATION_TYPES, TICKET_PRIORITIES, TICKET_SOURCES, TICKET_STATUSES, TICKET_TYPES } from '@/lib/enums';
import { createdAt, id, timestamps, tz } from './_columns';
import { user } from './auth';
import { guideVersion } from './content';
import { culture, cultureStage } from './culture';
import { garden, gardenGroup, gardenMember } from './garden';
import { zone } from './zone';

/* Ticketing (SPEC §4.2.3, RG-TCK). Rattachement polymorphe par arc exclusif : jardin seul, zone ou culture. */

export type ChecklistTemplate = { label: string }[];
export type TicketTemplate = {
  title: string; description: string | null; type: (typeof TICKET_TYPES)[number]; actionTag: (typeof ACTION_TAGS)[number] | null;
  priority: (typeof TICKET_PRIORITIES)[number]; checklist: ChecklistTemplate;
};
export type AssigneeTemplate = { memberIds: string[]; groupIds: string[] };

export const ticketSeries = pgTable(
  'ticket_series',
  {
    id: id(),
    gardenId: uuid('garden_id').notNull().references(() => garden.id, { onDelete: 'cascade' }),
    zoneId: uuid('zone_id'),
    cultureId: uuid('culture_id'),
    template: jsonb('template').$type<TicketTemplate>().notNull(),
    rrule: text('rrule').notNull(),
    dtstart: date('dtstart', { mode: 'string' }).notNull(),
    until: date('until', { mode: 'string' }),
    skipMissed: boolean('skip_missed').notNull().default(true),
    assignees: jsonb('assignees').$type<AssigneeTemplate>().notNull().default({ memberIds: [], groupIds: [] }),
    createdBy: uuid('created_by').notNull().references(() => user.id),
    endedAt: tz('ended_at'),
    ...timestamps(),
  },
  (t) => [
    unique('ticket_series_garden_id_id_uq').on(t.gardenId, t.id),
    foreignKey({ columns: [t.gardenId, t.zoneId], foreignColumns: [zone.gardenId, zone.id], name: 'series_zone_same_garden_fk' }),
    foreignKey({ columns: [t.gardenId, t.cultureId], foreignColumns: [culture.gardenId, culture.id], name: 'series_culture_same_garden_fk' }),
    check('series_one_target', sql`num_nonnulls(${t.zoneId}, ${t.cultureId}) <= 1`),
    index('ticket_series_garden_idx').on(t.gardenId).where(sql`${t.endedAt} is null`),
    index('ticket_series_zone_idx').on(t.zoneId),
    index('ticket_series_culture_idx').on(t.cultureId),
    index('ticket_series_created_by_idx').on(t.createdBy),
  ],
);

export const ticket = pgTable(
  'ticket',
  {
    id: id(),
    gardenId: uuid('garden_id').notNull().references(() => garden.id, { onDelete: 'cascade' }),
    zoneId: uuid('zone_id'),
    cultureId: uuid('culture_id'),
    level: text('level', { enum: ['garden', 'zone', 'culture'] }).generatedAlwaysAs(
      sql`case when culture_id is not null then 'culture' when zone_id is not null then 'zone' else 'garden' end`,
    ),
    type: text('type', { enum: TICKET_TYPES }).notNull(),
    actionTag: text('action_tag', { enum: ACTION_TAGS }),
    title: text('title').notNull(),
    /** Titre généré traduisible (tickets d'étape) : clé i18n et paramètres ; `title` reste le repli. */
    titleKey: text('title_key'),
    titleParams: jsonb('title_params').$type<Record<string, string>>(),
    description: text('description'),
    status: text('status', { enum: TICKET_STATUSES }).notNull().default('todo'),
    priority: text('priority', { enum: TICKET_PRIORITIES }).notNull().default('normal'),
    dueOn: date('due_on', { mode: 'string' }),
    visibleFrom: date('visible_from', { mode: 'string' }),
    source: text('source', { enum: TICKET_SOURCES }).notNull().default('manual'),
    seriesId: uuid('series_id'),
    occurrenceOn: date('occurrence_on', { mode: 'string' }),
    /** Occurrence modifiée seule : la série ne la touche plus (RG-TCK-09). */
    detached: boolean('detached').notNull().default(false),
    sourceStageId: uuid('source_stage_id').references(() => cultureStage.id, { onDelete: 'set null' }),
    sourceGuideVersionId: uuid('source_guide_version_id').references(() => guideVersion.id, { onDelete: 'set null' }),
    createdBy: uuid('created_by').notNull().references(() => user.id),
    completedAt: tz('completed_at'),
    completedBy: uuid('completed_by').references(() => user.id),
    firstCompletedAt: tz('first_completed_at'),
    dueSoonNotifiedAt: tz('due_soon_notified_at'),
    overdueNotifiedAt: tz('overdue_notified_at'),
    deletedAt: tz('deleted_at'),
    ...timestamps(),
  },
  (t) => [
    unique('ticket_garden_id_id_uq').on(t.gardenId, t.id),
    foreignKey({ columns: [t.gardenId, t.zoneId], foreignColumns: [zone.gardenId, zone.id], name: 'ticket_zone_same_garden_fk' }),
    foreignKey({ columns: [t.gardenId, t.cultureId], foreignColumns: [culture.gardenId, culture.id], name: 'ticket_culture_same_garden_fk' }),
    foreignKey({ columns: [t.gardenId, t.seriesId], foreignColumns: [ticketSeries.gardenId, ticketSeries.id], name: 'ticket_series_same_garden_fk' }),
    check('ticket_one_target', sql`num_nonnulls(${t.zoneId}, ${t.cultureId}) <= 1`),
    check('ticket_title_length', sql`char_length(${t.title}) between 3 and 140`),
    uniqueIndex('ticket_series_occurrence_uq').on(t.seriesId, t.occurrenceOn),
    uniqueIndex('ticket_source_stage_uq').on(t.sourceStageId).where(sql`${t.deletedAt} is null`),
    index('ticket_garden_status_due_idx').on(t.gardenId, t.status, t.dueOn).where(sql`${t.deletedAt} is null`),
    index('ticket_garden_zone_idx').on(t.gardenId, t.zoneId),
    index('ticket_garden_culture_idx').on(t.gardenId, t.cultureId),
    index('ticket_garden_visible_idx').on(t.gardenId, t.visibleFrom),
    index('ticket_series_idx').on(t.seriesId),
    index('ticket_created_by_idx').on(t.createdBy),
    index('ticket_completed_by_idx').on(t.completedBy),
    index('ticket_due_reminder_idx').on(t.dueOn).where(sql`${t.deletedAt} is null and ${t.status} in ('todo', 'in_progress', 'blocked')`),
  ],
);

export const ticketAssignee = pgTable(
  'ticket_assignee',
  {
    id: id(),
    gardenId: uuid('garden_id').notNull(),
    ticketId: uuid('ticket_id').notNull(),
    memberId: uuid('member_id'),
    groupId: uuid('group_id'),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({ columns: [t.gardenId, t.ticketId], foreignColumns: [ticket.gardenId, ticket.id], name: 'assignee_ticket_same_garden_fk' }).onDelete('cascade'),
    foreignKey({ columns: [t.gardenId, t.memberId], foreignColumns: [gardenMember.gardenId, gardenMember.id], name: 'assignee_member_same_garden_fk' }).onDelete('cascade'),
    foreignKey({ columns: [t.gardenId, t.groupId], foreignColumns: [gardenGroup.gardenId, gardenGroup.id], name: 'assignee_group_same_garden_fk' }).onDelete('cascade'),
    check('assignee_one_target', sql`num_nonnulls(${t.memberId}, ${t.groupId}) = 1`),
    uniqueIndex('assignee_member_uq').on(t.ticketId, t.memberId).where(sql`${t.memberId} is not null`),
    uniqueIndex('assignee_group_uq').on(t.ticketId, t.groupId).where(sql`${t.groupId} is not null`),
    index('assignee_member_idx').on(t.memberId),
    index('assignee_group_idx').on(t.groupId),
    index('assignee_ticket_idx').on(t.ticketId),
  ],
);

export const ticketChecklistItem = pgTable(
  'ticket_checklist_item',
  {
    id: id(),
    ticketId: uuid('ticket_id').notNull().references(() => ticket.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    done: boolean('done').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps(),
  },
  (t) => [index('checklist_ticket_idx').on(t.ticketId)],
);

export const ticketComment = pgTable(
  'ticket_comment',
  {
    id: id(),
    ticketId: uuid('ticket_id').notNull().references(() => ticket.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id').notNull().references(() => user.id),
    body: text('body').notNull(),
    mentions: jsonb('mentions').$type<string[]>().notNull().default([]),
    editedAt: tz('edited_at'),
    deletedAt: tz('deleted_at'),
    ...timestamps(),
  },
  (t) => [index('comment_ticket_idx').on(t.ticketId, t.createdAt), index('comment_author_idx').on(t.authorId)],
);

/** Historique append-only des transitions et modifications (RG-TCK-02). */
export const ticketEvent = pgTable(
  'ticket_event',
  {
    id: id(),
    ticketId: uuid('ticket_id').notNull().references(() => ticket.id, { onDelete: 'cascade' }),
    actorId: uuid('actor_id').references(() => user.id),
    kind: text('kind', { enum: ['created', 'status', 'assigned', 'updated', 'commented'] }).notNull(),
    diff: jsonb('diff').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index('ticket_event_ticket_idx').on(t.ticketId, t.createdAt), index('ticket_event_actor_idx').on(t.actorId)],
);

export const notification = pgTable(
  'notification',
  {
    id: id(),
    userId: uuid('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    gardenId: uuid('garden_id').references(() => garden.id, { onDelete: 'cascade' }),
    type: text('type', { enum: NOTIFICATION_TYPES }).notNull(),
    /** Regroupement des notifications identiques sur 10 minutes (RG-NTF-03). */
    groupKey: text('group_key').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    count: integer('count').notNull().default(1),
    readAt: tz('read_at'),
    emailedAt: tz('emailed_at'),
    ...timestamps(),
  },
  (t) => [
    index('notification_user_idx').on(t.userId, t.readAt, t.createdAt),
    index('notification_group_idx').on(t.userId, t.type, t.groupKey, t.createdAt),
    index('notification_garden_idx').on(t.gardenId),
  ],
);

export const notificationPreference = pgTable(
  'notification_preference',
  {
    userId: uuid('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    type: text('type', { enum: NOTIFICATION_TYPES }).notNull(),
    channel: text('channel', { enum: NOTIFICATION_CHANNELS }).notNull(),
    enabled: boolean('enabled').notNull(),
    ...timestamps(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.type, t.channel] })],
);
