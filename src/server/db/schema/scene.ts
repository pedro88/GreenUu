import { sql } from 'drizzle-orm';
import { check, foreignKey, index, integer, jsonb, pgTable, smallint, text, uuid } from 'drizzle-orm/pg-core';
import type { UnlockConditionV1 } from '@/features/progression/unlock.pure';
import type { RectGeometry } from '@/features/zone/tree';
import { TERRAIN_KINDS } from '@/lib/enums';
import { id, timestamps } from './_columns';
import { user } from './auth';
import { garden } from './garden';
import { practice, zone } from './zone';

/* Vue jardin et éditeur de plan (SPEC §4.2.1, §9.7). */

/** Élément du plan sans culture ni ticket propre : allée, point d'eau, haie… Supprimable, sans historique. */
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
