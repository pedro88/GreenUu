import { sql } from 'drizzle-orm';
import { type AnyPgColumn, boolean, check, index, integer, jsonb, pgTable, primaryKey, smallint, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import type { GuideCalendarV1, GuideContextV1, GuideDraft } from '@/lib/content-types';
import { ENVIRONMENTS, GUIDE_VISIBILITIES, REPORT_REASONS, REPORT_STATUSES } from '@/lib/enums';
import { createdAt, id, timestamps, tz } from './_columns';
import { user } from './auth';
import { garden } from './garden';
import { species, variety } from './plant';

/* Guides, tips et modération (SPEC §4.2.4, RG-GUI, RG-TIP, RG-MOD). */


export const guide = pgTable(
  'guide',
  {
    id: id(),
    authorId: uuid('author_id').notNull().references(() => user.id),
    gardenId: uuid('garden_id').references(() => garden.id, { onDelete: 'cascade' }),
    speciesId: uuid('species_id').notNull().references(() => species.id),
    varietyId: uuid('variety_id').references(() => variety.id),
    visibility: text('visibility', { enum: GUIDE_VISIBILITIES }).notNull(),
    slug: text('slug').notNull(),
    forkedFromVersionId: uuid('forked_from_version_id').references((): AnyPgColumn => guideVersion.id, { onDelete: 'set null' }),
    currentVersionId: uuid('current_version_id').references((): AnyPgColumn => guideVersion.id),
    draft: jsonb('draft').$type<GuideDraft>().notNull(),
    hiddenByModeration: boolean('hidden_by_moderation').notNull().default(false),
    deletedAt: tz('deleted_at'),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('guide_slug_uq').on(t.slug),
    check('guide_private_has_garden', sql`(${t.visibility} = 'private') = (${t.gardenId} is not null)`),
    index('guide_visibility_species_idx').on(t.visibility, t.speciesId).where(sql`${t.deletedAt} is null`),
    index('guide_author_idx').on(t.authorId),
    index('guide_garden_idx').on(t.gardenId),
    index('guide_forked_from_idx').on(t.forkedFromVersionId),
  ],
);

/** Version publiée, immuable (trigger `guide_version_immutable`, GUI-03). */
export const guideVersion = pgTable(
  'guide_version',
  {
    id: id(),
    guideId: uuid('guide_id').notNull().references((): AnyPgColumn => guide.id, { onDelete: 'cascade' }),
    number: integer('number').notNull(),
    title: text('title').notNull(),
    bodyMd: text('body_md').notNull(),
    context: jsonb('context').$type<GuideContextV1>().notNull(),
    calendarTemplate: jsonb('calendar_template').$type<GuideCalendarV1>(),
    changeNote: text('change_note'),
    publishedAt: tz('published_at').notNull(),
  },
  (t) => [uniqueIndex('guide_version_number_uq').on(t.guideId, t.number)],
);

export const tag = pgTable('tag', { id: id(), slug: text('slug').notNull(), createdAt: createdAt() }, (t) => [uniqueIndex('tag_slug_uq').on(t.slug)]);

export const tip = pgTable(
  'tip',
  {
    id: id(),
    authorId: uuid('author_id').notNull().references(() => user.id),
    speciesId: uuid('species_id').references(() => species.id),
    body: text('body').notNull(),
    /** Contexte repris du jardin courant, retirable (RG-TIP-01) ; jamais la localisation précise (GRD-03). */
    geohash4: text('geohash4'),
    koppen: text('koppen'),
    environment: text('environment', { enum: ENVIRONMENTS }),
    usefulCount: integer('useful_count').notNull().default(0),
    notUsefulCount: integer('not_useful_count').notNull().default(0),
    hiddenByModeration: boolean('hidden_by_moderation').notNull().default(false),
    deletedAt: tz('deleted_at'),
    ...timestamps(),
  },
  (t) => [
    check('tip_body_length', sql`char_length(${t.body}) between 10 and 500`),
    index('tip_feed_idx').on(t.createdAt).where(sql`${t.deletedAt} is null and not ${t.hiddenByModeration}`),
    index('tip_author_idx').on(t.authorId),
    index('tip_species_idx').on(t.speciesId),
  ],
);

export const tipTag = pgTable(
  'tip_tag',
  {
    tipId: uuid('tip_id').notNull().references(() => tip.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id').notNull().references(() => tag.id),
  },
  (t) => [primaryKey({ columns: [t.tipId, t.tagId] }), index('tip_tag_tag_idx').on(t.tagId)],
);

/** Un vote par personne et par tip ; jamais sur son propre tip (service + trigger `tip_vote_not_author`). */
export const tipVote = pgTable(
  'tip_vote',
  {
    tipId: uuid('tip_id').notNull().references(() => tip.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    value: smallint('value').notNull(),
    ...timestamps(),
  },
  (t) => [primaryKey({ columns: [t.tipId, t.userId] }), check('tip_vote_value', sql`${t.value} in (-1, 1)`), index('tip_vote_user_idx').on(t.userId)],
);

/** Signalement : arc exclusif guide / tip / profil (RG-MOD-01), un seul par personne et par contenu. */
export const contentReport = pgTable(
  'content_report',
  {
    id: id(),
    reporterId: uuid('reporter_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    guideId: uuid('guide_id').references(() => guide.id, { onDelete: 'cascade' }),
    tipId: uuid('tip_id').references(() => tip.id, { onDelete: 'cascade' }),
    reportedUserId: uuid('reported_user_id').references(() => user.id, { onDelete: 'cascade' }),
    reason: text('reason', { enum: REPORT_REASONS }).notNull(),
    details: text('details'),
    status: text('status', { enum: REPORT_STATUSES }).notNull().default('open'),
    handledBy: uuid('handled_by').references(() => user.id),
    handledAt: tz('handled_at'),
    createdAt: createdAt(),
  },
  (t) => [
    check('content_report_one_target', sql`num_nonnulls(${t.guideId}, ${t.tipId}, ${t.reportedUserId}) = 1`),
    uniqueIndex('content_report_guide_uq').on(t.reporterId, t.guideId).where(sql`${t.guideId} is not null`),
    uniqueIndex('content_report_tip_uq').on(t.reporterId, t.tipId).where(sql`${t.tipId} is not null`),
    uniqueIndex('content_report_user_uq').on(t.reporterId, t.reportedUserId).where(sql`${t.reportedUserId} is not null`),
    index('content_report_status_idx').on(t.status),
    index('content_report_guide_idx').on(t.guideId),
    index('content_report_tip_idx').on(t.tipId),
    index('content_report_reported_user_idx').on(t.reportedUserId),
  ],
);
