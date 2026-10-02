import { sql } from 'drizzle-orm';
import { boolean, check, date, foreignKey, index, integer, jsonb, numeric, pgTable, smallint, text, timestamp, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { CULTURE_STATUSES, HARVEST_UNITS, INTERVENTIONS, JOURNAL_KINDS, METHODS, SEED_SOURCES, STAGES } from '@/lib/enums';
import { createdAt, id, timestamps, tz } from './_columns';
import { user } from './auth';
import { garden, season } from './garden';
import { problem, species, variety } from './plant';
import { zone } from './zone';

/* Cultures, étapes, journal, récoltes, pièces jointes (SPEC §4.2.2, RG-CUL, RG-JRN). */

export const culture = pgTable(
  'culture',
  {
    id: id(),
    gardenId: uuid('garden_id').notNull().references(() => garden.id, { onDelete: 'cascade' }),
    zoneId: uuid('zone_id').notNull(),
    seasonId: uuid('season_id').notNull(),
    speciesId: uuid('species_id').notNull().references(() => species.id),
    varietyId: uuid('variety_id').references(() => variety.id),
    method: text('method', { enum: METHODS }).notNull(),
    status: text('status', { enum: CULTURE_STATUSES }).notNull().default('planned'),
    plantCount: integer('plant_count'),
    areaM2: numeric('area_m2', { precision: 10, scale: 2, mode: 'number' }),
    seedSource: text('seed_source', { enum: SEED_SOURCES }).notNull().default('unknown'),
    seedParentCultureId: uuid('seed_parent_culture_id'),
    rotationOverride: boolean('rotation_override').notNull().default(false),
    /** Renseigné au lot 4 (application d'un guide). */
    appliedGuideVersionId: uuid('applied_guide_version_id'),
    notes: text('notes'),
    createdBy: uuid('created_by').notNull().references(() => user.id),
    occupiedFrom: date('occupied_from', { mode: 'string' }),
    occupiedTo: date('occupied_to', { mode: 'string' }),
    deletedAt: tz('deleted_at'),
    deletedBy: uuid('deleted_by').references(() => user.id),
    ...timestamps(),
  },
  (t) => [
    unique('culture_garden_id_id_uq').on(t.gardenId, t.id),
    foreignKey({ columns: [t.gardenId, t.zoneId], foreignColumns: [zone.gardenId, zone.id], name: 'culture_zone_same_garden_fk' }),
    foreignKey({ columns: [t.gardenId, t.seasonId], foreignColumns: [season.gardenId, season.id], name: 'culture_season_same_garden_fk' }),
    foreignKey({ columns: [t.seedParentCultureId], foreignColumns: [t.id], name: 'culture_seed_parent_fk' }),
    check('culture_area_positive', sql`${t.areaM2} is null or ${t.areaM2} > 0`),
    check('culture_plants_positive', sql`${t.plantCount} is null or ${t.plantCount} > 0`),
    index('culture_garden_season_idx').on(t.gardenId, t.seasonId).where(sql`${t.deletedAt} is null`),
    index('culture_garden_zone_occ_idx').on(t.gardenId, t.zoneId, t.occupiedFrom).where(sql`${t.deletedAt} is null`),
    index('culture_species_idx').on(t.speciesId),
    index('culture_variety_idx').on(t.varietyId),
    index('culture_created_by_idx').on(t.createdBy),
    index('culture_deleted_by_idx').on(t.deletedBy),
    index('culture_seed_parent_idx').on(t.seedParentCultureId),
    index('culture_season_idx').on(t.seasonId),
  ],
);

export const cultureStage = pgTable(
  'culture_stage',
  {
    id: id(),
    gardenId: uuid('garden_id').notNull(),
    cultureId: uuid('culture_id').notNull(),
    stage: text('stage', { enum: STAGES }).notNull(),
    plannedOn: date('planned_on', { mode: 'string' }),
    actualOn: date('actual_on', { mode: 'string' }),
    recordedBy: uuid('recorded_by').references(() => user.id),
    ...timestamps(),
  },
  (t) => [
    foreignKey({ columns: [t.gardenId, t.cultureId], foreignColumns: [culture.gardenId, culture.id], name: 'stage_culture_same_garden_fk' }).onDelete('cascade'),
    uniqueIndex('culture_stage_uq').on(t.cultureId, t.stage),
    index('culture_stage_planned_idx').on(t.gardenId, t.plannedOn).where(sql`${t.actualOn} is null`),
    index('culture_stage_recorded_by_idx').on(t.recordedBy),
  ],
);

export type WeatherNote = { tempC?: number | undefined; conditions?: 'sun' | 'clouds' | 'rain' | 'frost' | 'wind' | 'heat' | 'snow' | undefined };

export const journalEntry = pgTable(
  'journal_entry',
  {
    id: id(),
    gardenId: uuid('garden_id').notNull().references(() => garden.id, { onDelete: 'cascade' }),
    cultureId: uuid('culture_id'),
    zoneId: uuid('zone_id'),
    kind: text('kind', { enum: JOURNAL_KINDS }).notNull(),
    observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
    body: text('body'),
    problemId: uuid('problem_id').references(() => problem.id),
    problemOther: text('problem_other'),
    severity: smallint('severity'),
    intervention: text('intervention', { enum: INTERVENTIONS }),
    weather: jsonb('weather').$type<WeatherNote>(),
    resolved: boolean('resolved').notNull().default(false),
    authorId: uuid('author_id').notNull().references(() => user.id),
    deletedAt: tz('deleted_at'),
    ...timestamps(),
  },
  (t) => [
    foreignKey({ columns: [t.gardenId, t.cultureId], foreignColumns: [culture.gardenId, culture.id], name: 'journal_culture_same_garden_fk' }),
    foreignKey({ columns: [t.gardenId, t.zoneId], foreignColumns: [zone.gardenId, zone.id], name: 'journal_zone_same_garden_fk' }),
    check('journal_one_target', sql`num_nonnulls(${t.cultureId}, ${t.zoneId}) = 1`),
    check('journal_severity', sql`${t.severity} is null or ${t.severity} between 1 and 3`),
    index('journal_culture_idx').on(t.gardenId, t.cultureId, t.observedAt).where(sql`${t.deletedAt} is null`),
    index('journal_zone_idx').on(t.gardenId, t.zoneId, t.observedAt).where(sql`${t.deletedAt} is null`),
    index('journal_problem_idx').on(t.problemId),
    index('journal_author_idx').on(t.authorId),
  ],
);

export const harvest = pgTable(
  'harvest',
  {
    id: id(),
    gardenId: uuid('garden_id').notNull(),
    cultureId: uuid('culture_id').notNull(),
    harvestedOn: date('harvested_on', { mode: 'string' }).notNull(),
    quantity: numeric('quantity', { precision: 10, scale: 3, mode: 'number' }).notNull(),
    unit: text('unit', { enum: HARVEST_UNITS }).notNull(),
    quantityKg: numeric('quantity_kg', { precision: 10, scale: 3, mode: 'number' }),
    quality: smallint('quality'),
    seedSaving: boolean('seed_saving').notNull().default(false),
    note: text('note'),
    authorId: uuid('author_id').notNull().references(() => user.id),
    deletedAt: tz('deleted_at'),
    ...timestamps(),
  },
  (t) => [
    foreignKey({ columns: [t.gardenId, t.cultureId], foreignColumns: [culture.gardenId, culture.id], name: 'harvest_culture_same_garden_fk' }),
    check('harvest_quantity_positive', sql`${t.quantity} > 0`),
    check('harvest_quality', sql`${t.quality} is null or ${t.quality} between 1 and 5`),
    index('harvest_culture_idx').on(t.gardenId, t.cultureId, t.harvestedOn).where(sql`${t.deletedAt} is null`),
    index('harvest_author_idx').on(t.authorId),
  ],
);

/**
 * Pièces jointes. Téléversées d'abord « en attente » (aucune cible), puis rattachées à une entrée de journal.
 * Arc exclusif : au plus une cible parmi entrée de journal, ticket, commentaire.
 */
export const attachment = pgTable(
  'attachment',
  {
    id: id(),
    gardenId: uuid('garden_id').notNull().references(() => garden.id, { onDelete: 'cascade' }),
    journalEntryId: uuid('journal_entry_id').references(() => journalEntry.id, { onDelete: 'cascade' }),
    /** Cibles ajoutées au lot 3 (FK posées dans ticket.ts via migration, pour éviter un import circulaire). */
    ticketId: uuid('ticket_id'),
    ticketCommentId: uuid('ticket_comment_id'),
    storageKey: text('storage_key').notNull().unique(),
    mime: text('mime', { enum: ['image/jpeg', 'image/png', 'image/webp'] }).notNull(),
    bytes: integer('bytes').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    uploadedBy: uuid('uploaded_by').notNull().references(() => user.id),
    deletedAt: tz('deleted_at'),
    createdAt: createdAt(),
  },
  (t) => [
    check('attachment_max_one_target', sql`num_nonnulls(${t.journalEntryId}, ${t.ticketId}, ${t.ticketCommentId}) <= 1`),
    index('attachment_ticket_idx').on(t.ticketId),
    index('attachment_comment_idx').on(t.ticketCommentId),
    index('attachment_garden_idx').on(t.gardenId),
    index('attachment_journal_idx').on(t.journalEntryId),
    index('attachment_uploaded_by_idx').on(t.uploadedBy),
  ],
);
