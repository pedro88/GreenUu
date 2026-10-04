import { sql } from 'drizzle-orm';
import { check, date, foreignKey, index, integer, jsonb, pgTable, smallint, text, unique, uuid } from 'drizzle-orm/pg-core';
import type { UnlockConditionV1 } from '@/features/progression/unlock.pure';
import type { RectGeometry } from '@/features/zone/tree';
import type { PlanSnapshotV1 } from '@/features/scene/history.schema';
import { TERRAIN_CELL_KINDS, TERRAIN_KINDS } from '@/lib/enums';
import { id, timestamps } from './_columns';
import { user } from './auth';
import { garden } from './garden';
import { practice, zone } from './zone';

/* Vue jardin et éditeur de plan (SPEC §4.2.1, §9.7). */

/**
 * Ancien terrain en rectangles (lots 7 et 8). Converti en cases et en objets posés par la migration du lot 9, il n'est
 * plus lu ; sa suppression attend une décision explicite (SPEC §18, 0.17).
 */
export const terrainElement = pgTable(
  'terrain_element',
  {
    id: id(),
    gardenId: uuid('garden_id').notNull().references(() => garden.id, { onDelete: 'cascade' }),
    /** Scène : null = extérieur, sinon l'intérieur d'une zone `has_interior`. */
    sceneZoneId: uuid('scene_zone_id'),
    kind: text('kind', { enum: TERRAIN_KINDS }).notNull(),
    geometry: jsonb('geometry').$type<RectGeometry>().notNull(),
    ...timestamps(),
  },
  (t) => [
    foreignKey({ columns: [t.gardenId, t.sceneZoneId], foreignColumns: [zone.gardenId, zone.id], name: 'terrain_scene_same_garden_fk' }).onDelete('cascade'),
    index('terrain_garden_scene_idx').on(t.gardenId, t.sceneZoneId),
  ],
);

/** Catalogue des objets de déco (§4.2.6), défini en code et chargé avec le référentiel. */
export const decorItem = pgTable('decor_item', {
  id: id(),
  code: text('code').notNull().unique(),
  spriteKey: text('sprite_key').notNull(),
  widthTiles: smallint('width_tiles').notNull().default(1),
  heightTiles: smallint('height_tiles').notNull().default(1),
  /** Objet ★ : il peut être déclaré comme cette pratique réelle du jardin (DEC-03). */
  practiceId: uuid('practice_id').references(() => practice.id),
  unlockCondition: jsonb('unlock_condition').$type<UnlockConditionV1>().notNull(),
  sortOrder: smallint('sort_order').notNull().default(100),
  ...timestamps(),
});

/** Objet posé sur le plan : sans effet sur les cultures ni sur les zones (DEC-01). Supprimable, sans historique. */
export const decorPlacement = pgTable(
  'decor_placement',
  {
    id: id(),
    gardenId: uuid('garden_id').notNull().references(() => garden.id, { onDelete: 'cascade' }),
    /** Scène : null = extérieur, sinon l'intérieur d'une zone `has_interior`. */
    sceneZoneId: uuid('scene_zone_id'),
    decorItemId: uuid('decor_item_id').notNull().references(() => decorItem.id),
    /** Pied de l'objet (bas au centre, §9.2), en centimètres dans la scène. */
    xCm: integer('x_cm').notNull(),
    yCm: integer('y_cm').notNull(),
    /** Texte libre des panneaux. */
    label: text('label'),
    placedBy: uuid('placed_by').references(() => user.id, { onDelete: 'set null' }),
    ...timestamps(),
  },
  (t) => [
    foreignKey({ columns: [t.gardenId, t.sceneZoneId], foreignColumns: [zone.gardenId, zone.id], name: 'decor_scene_same_garden_fk' }).onDelete('cascade'),
    check('decor_placement_position_ck', sql`${t.xCm} >= 0 and ${t.yCm} >= 0`),
    check('decor_placement_label_ck', sql`${t.label} is null or char_length(${t.label}) between 1 and 40`),
    index('decor_garden_scene_idx').on(t.gardenId, t.sceneZoneId),
    index('decor_item_idx').on(t.decorItemId),
  ],
);

/**
 * Terrain peint case par case (§4.2.6, lot 9) : une case de la grille du plan, en tuiles de l'échelle courante, et un
 * seul type par case. Sans historique propre : l'instantané du plan du jour en garde la trace.
 */
export const terrainCell = pgTable(
  'terrain_cell',
  {
    id: id(),
    gardenId: uuid('garden_id').notNull().references(() => garden.id, { onDelete: 'cascade' }),
    /** Scène : null = extérieur, sinon l'intérieur d'une zone `has_interior`. */
    sceneZoneId: uuid('scene_zone_id'),
    x: integer('x').notNull(),
    y: integer('y').notNull(),
    kind: text('kind', { enum: TERRAIN_CELL_KINDS }).notNull(),
    ...timestamps(),
  },
  (t) => [
    foreignKey({ columns: [t.gardenId, t.sceneZoneId], foreignColumns: [zone.gardenId, zone.id], name: 'terrain_cell_scene_same_garden_fk' }).onDelete('cascade'),
    unique('terrain_cell_position_uq').on(t.gardenId, t.sceneZoneId, t.x, t.y).nullsNotDistinct(),
    check('terrain_cell_position_ck', sql`${t.x} between 0 and 10000 and ${t.y} between 0 and 10000`),
  ],
);

/**
 * Instantané du plan (§4.2.6, TLP-01) : un par jour de modification et par jardin, la dernière version du jour remplace
 * les précédentes. Écrit dans la transaction de la modification ; il servira au timelapse (lot 10).
 */
export const planSnapshot = pgTable(
  'plan_snapshot',
  {
    id: id(),
    gardenId: uuid('garden_id').notNull().references(() => garden.id, { onDelete: 'cascade' }),
    /** Jour local du jardin. */
    takenOn: date('taken_on').notNull(),
    planVersion: integer('plan_version').notNull(),
    payload: jsonb('payload').$type<PlanSnapshotV1>().notNull(),
    ...timestamps(),
  },
  (t) => [unique('plan_snapshot_day_uq').on(t.gardenId, t.takenOn)],
);
