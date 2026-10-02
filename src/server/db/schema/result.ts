import { sql } from 'drizzle-orm';
import {
  boolean, check, foreignKey, index, integer, numeric, pgMaterializedView, pgTable, primaryKey, smallint, text, uniqueIndex, uuid,
} from 'drizzle-orm/pg-core';
import { ENVIRONMENTS, METHODS } from '@/lib/enums';
import { createdAt, id, timestamps, tz } from './_columns';
import { user } from './auth';
import { culture } from './culture';
import { garden, season } from './garden';
import { problem } from './plant';

/* Bilans, partage anonymisé et RGPD (SPEC §4.2.2, §6.10, §11). */

/** Un bilan par culture et par saison (RG-RES-01) ; une nouvelle saisie met à jour le bilan existant (RES-05). */
export const cultureResult = pgTable(
  'culture_result',
  {
    id: id(),
    gardenId: uuid('garden_id').notNull().references(() => garden.id, { onDelete: 'cascade' }),
    cultureId: uuid('culture_id').notNull(),
    seasonId: uuid('season_id').notNull(),
    totalKg: numeric('total_kg', { precision: 10, scale: 3, mode: 'number' }),
    areaM2: numeric('area_m2', { precision: 10, scale: 2, mode: 'number' }),
    yieldKgM2: numeric('yield_kg_m2', { precision: 10, scale: 3, mode: 'number' }),
    quality: smallint('quality'),
    successPct: smallint('success_pct'),
    rating: smallint('rating'),
    wouldGrowAgain: boolean('would_grow_again'),
    noHarvest: boolean('no_harvest').notNull().default(false),
    /** Choix explicite « aucun problème » : la revue des problèmes compte pour la complétude (RG-RES-03). */
    problemsReviewed: boolean('problems_reviewed').notNull().default(false),
    notes: text('notes'),
    completeness: smallint('completeness').notNull(),
    authorId: uuid('author_id').notNull().references(() => user.id),
    submittedAt: tz('submitted_at').notNull(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('culture_result_culture_season_uq').on(t.cultureId, t.seasonId),
    foreignKey({ columns: [t.gardenId, t.cultureId], foreignColumns: [culture.gardenId, culture.id], name: 'result_culture_same_garden_fk' }).onDelete('cascade'),
    foreignKey({ columns: [t.gardenId, t.seasonId], foreignColumns: [season.gardenId, season.id], name: 'result_season_same_garden_fk' }).onDelete('cascade'),
    check('result_quality_range', sql`${t.quality} is null or ${t.quality} between 1 and 5`),
    check('result_rating_range', sql`${t.rating} is null or ${t.rating} between 1 and 5`),
    check('result_success_range', sql`${t.successPct} is null or ${t.successPct} between 0 and 100`),
    check('result_completeness_range', sql`${t.completeness} between 0 and 100`),
    index('culture_result_garden_idx').on(t.gardenId),
    index('culture_result_season_idx').on(t.seasonId),
    index('culture_result_author_idx').on(t.authorId),
  ],
);

export const cultureResultProblem = pgTable(
  'culture_result_problem',
  {
    resultId: uuid('result_id').notNull().references(() => cultureResult.id, { onDelete: 'cascade' }),
    problemId: uuid('problem_id').notNull().references(() => problem.id),
    severity: smallint('severity').notNull().default(2),
  },
  (t) => [primaryKey({ columns: [t.resultId, t.problemId] }), check('result_problem_severity', sql`${t.severity} between 1 and 3`), index('culture_result_problem_problem_idx').on(t.problemId)],
);

/** Secret HMAC annuel du pseudo-identifiant de jardin (§7.6) ; jamais exposé, renouvelé chaque année. */
export const recoSecret = pgTable('reco_secret', {
  year: integer('year').primaryKey(),
  secret: text('secret').notNull(),
  createdAt: createdAt(),
});

/** Export RGPD (§11.4) : archive produite par un job, lien valable 7 jours, une demande par 24 heures. */
export const dataExport = pgTable(
  'data_export',
  {
    id: id(),
    userId: uuid('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    status: text('status', { enum: ['pending', 'ready', 'failed'] }).notNull().default('pending'),
    storageKey: text('storage_key'),
    bytes: integer('bytes'),
    readyAt: tz('ready_at'),
    expiresAt: tz('expires_at'),
    ...timestamps(),
  },
  (t) => [index('data_export_user_idx').on(t.userId, t.createdAt)],
);

/**
 * Vue matérialisée anonymisée (§11.3), créée par la migration `0009` : aucune colonne d'utilisateur, de jardin en clair,
 * de nom, de texte libre ni de coordonnée. Déclarée ici pour les lectures typées du moteur de recommandation.
 */
export const sharedResultFact = pgMaterializedView('shared_result_fact', {
  factId: text('fact_id').notNull(),
  gardenPseudo: text('garden_pseudo').notNull(),
  geohash4: text('geohash4').notNull(),
  koppen: text('koppen'),
  hardinessZone: text('hardiness_zone'),
  altitude100: integer('altitude_100'),
  soilType: text('soil_type'),
  soilPhHalf: numeric('soil_ph_half', { mode: 'number' }),
  environment: text('environment', { enum: ENVIRONMENTS }),
  practices: text('practices').array().notNull(),
  speciesId: uuid('species_id').notNull(),
  varietyId: uuid('variety_id'),
  method: text('method', { enum: METHODS }).notNull(),
  sowingDoy: smallint('sowing_doy'),
  plantingDoy: smallint('planting_doy'),
  successPct: smallint('success_pct'),
  rating: smallint('rating'),
  quality: smallint('quality'),
  yieldKgM2: numeric('yield_kg_m2', { mode: 'number' }),
  problemCodes: text('problem_codes').array().notNull(),
  year: integer('year').notNull(),
}).existing();
