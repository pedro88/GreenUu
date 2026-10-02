import { foreignKey, index, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import type { RectGeometry } from '@/features/zone/tree';
import { TERRAIN_KINDS } from '@/lib/enums';
import { id, timestamps } from './_columns';
import { garden } from './garden';
import { zone } from './zone';

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
