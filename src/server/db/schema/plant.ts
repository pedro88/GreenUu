import { sql } from 'drizzle-orm';
import { boolean, check, index, integer, jsonb, numeric, pgTable, primaryKey, smallint, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import {
  COMPANION_EFFECTS, ENVIRONMENTS, METHODS, PROBLEM_CATEGORIES, SKILL_DOMAINS, STAGES, SUN_NEEDS, VARIETY_ORIGINS,
  VARIETY_STATUSES, VISUAL_MODELS, WATER_NEEDS,
} from '@/lib/enums';
import { id, timestamps, tz } from './_columns';
import { user } from './auth';
import { garden } from './garden';

/* Référentiel végétal (SPEC §4.2.2, RG-PLT). `search_text` = noms normalisés (minuscules, sans accents),
   indexé en trigrammes pour une recherche tolérante aux fautes (RG-PLT-04). */

export type LocalizedNames = { fr: string[]; en?: string[] };

export const botanicalFamily = pgTable('botanical_family', {
  id: id(),
  code: text('code').notNull().unique(),
  latinName: text('latin_name').notNull(),
  rotationReturnYears: smallint('rotation_return_years').notNull().default(2),
  spriteKey: text('sprite_key'),
  ...timestamps(),
});

export const species = pgTable(
  'species',
  {
    id: id(),
    familyId: uuid('family_id').notNull().references(() => botanicalFamily.id),
    latinName: text('latin_name').notNull().unique(),
    commonNames: jsonb('common_names').$type<LocalizedNames>().notNull(),
    visualModel: text('visual_model', { enum: VISUAL_MODELS }).notNull(),
    skillDomain: text('skill_domain', { enum: SKILL_DOMAINS }).notNull(),
    perennial: boolean('perennial').notNull().default(false),
    greenManure: boolean('green_manure').notNull().default(false),
    sun: text('sun', { enum: SUN_NEEDS }).notNull(),
    water: text('water', { enum: WATER_NEEDS }).notNull(),
    tempMinC: numeric('temp_min_c', { precision: 4, scale: 1, mode: 'number' }),
    tempOptC: numeric('temp_opt_c', { precision: 4, scale: 1, mode: 'number' }),
    tempMaxC: numeric('temp_max_c', { precision: 4, scale: 1, mode: 'number' }),
    spacingRowCm: integer('spacing_row_cm'),
    spacingPlantCm: integer('spacing_plant_cm'),
    daysToMaturityMin: integer('days_to_maturity_min'),
    daysToMaturityMax: integer('days_to_maturity_max'),
    avgUnitWeightG: numeric('avg_unit_weight_g', { precision: 8, scale: 1, mode: 'number' }),
    spriteKey: text('sprite_key'),
    searchText: text('search_text').notNull(),
    ...timestamps(),
  },
  (t) => [
    index('species_family_idx').on(t.familyId),
    index('species_search_trgm_idx').using('gin', sql`${t.searchText} gin_trgm_ops`),
  ],
);

export const variety = pgTable(
  'variety',
  {
    id: id(),
    speciesId: uuid('species_id').notNull().references(() => species.id),
    name: text('name').notNull(),
    origin: text('origin', { enum: VARIETY_ORIGINS }).notNull().default('commercial'),
    description: text('description'),
    status: text('status', { enum: VARIETY_STATUSES }).notNull().default('approved'),
    proposedBy: uuid('proposed_by').references(() => user.id),
    proposedGardenId: uuid('proposed_garden_id').references(() => garden.id, { onDelete: 'set null' }),
    mergedIntoId: uuid('merged_into_id'),
    moderatedBy: uuid('moderated_by').references(() => user.id),
    moderatedAt: tz('moderated_at'),
    moderationNote: text('moderation_note'),
    spriteKey: text('sprite_key'),
    searchText: text('search_text').notNull(),
    ...timestamps(),
  },
  (t) => [
    index('variety_species_idx').on(t.speciesId),
    index('variety_status_idx').on(t.status),
    index('variety_proposed_by_idx').on(t.proposedBy),
    index('variety_proposed_garden_idx').on(t.proposedGardenId),
    index('variety_merged_into_idx').on(t.mergedIntoId),
    index('variety_moderated_by_idx').on(t.moderatedBy),
    index('variety_search_trgm_idx').using('gin', sql`${t.searchText} gin_trgm_ops`),
    uniqueIndex('variety_species_name_approved_uq').on(t.speciesId, sql`lower(${t.name})`).where(sql`${t.status} = 'approved'`),
  ],
);

/** Relation symétrique stockée une fois : species_a_id < species_b_id (RG-PLT-05). */
export const companion = pgTable(
  'companion',
  {
    speciesAId: uuid('species_a_id').notNull().references(() => species.id, { onDelete: 'cascade' }),
    speciesBId: uuid('species_b_id').notNull().references(() => species.id, { onDelete: 'cascade' }),
    effect: text('effect', { enum: COMPANION_EFFECTS }).notNull(),
    noteKey: text('note_key'),
    ...timestamps(),
  },
  (t) => [
    primaryKey({ columns: [t.speciesAId, t.speciesBId] }),
    check('companion_ordered', sql`${t.speciesAId} < ${t.speciesBId}`),
    index('companion_b_idx').on(t.speciesBId),
  ],
);

/** Fenêtres indicatives (jour de l'année) par groupe Köppen, environnement et méthode. */
export const speciesCalendar = pgTable(
  'species_calendar',
  {
    id: id(),
    speciesId: uuid('species_id').notNull().references(() => species.id, { onDelete: 'cascade' }),
    koppenGroup: text('koppen_group').notNull(),
    environment: text('environment', { enum: ENVIRONMENTS }).notNull(),
    method: text('method', { enum: METHODS }).notNull(),
    stage: text('stage', { enum: STAGES }).notNull(),
    windowStartDoy: smallint('window_start_doy').notNull(),
    windowEndDoy: smallint('window_end_doy').notNull(),
    source: text('source').notNull().default('reference'),
    ...timestamps(),
  },
  (t) => [
    index('species_calendar_species_idx').on(t.speciesId),
    uniqueIndex('species_calendar_uq').on(t.speciesId, t.koppenGroup, t.environment, t.method, t.stage),
    check('species_calendar_doy', sql`${t.windowStartDoy} between 1 and 366 and ${t.windowEndDoy} between 1 and 366`),
  ],
);

export const problem = pgTable('problem', {
  id: id(),
  code: text('code').notNull().unique(),
  category: text('category', { enum: PROBLEM_CATEGORIES }).notNull(),
  sortOrder: smallint('sort_order').notNull().default(100),
  ...timestamps(),
});
