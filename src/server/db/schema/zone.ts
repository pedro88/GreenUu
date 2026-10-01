import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { RectGeometry } from '@/features/zone/tree';
import { createdAt, id, timestamps, tz } from './_columns';
import { ENVIRONMENTS, garden, gardenGroup, season } from './garden';

export const zoneType = pgTable(
  'zone_type',
  {
    id: id(),
    /** null = type de base, commun à tous les jardins */
    gardenId: uuid('garden_id').references(() => garden.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    /** Clé i18n pour les types de base, libellé libre pour les types personnalisés */
    label: text('label').notNull(),
    canHostCultures: boolean('can_host_cultures').notNull().default(true),
    hasInteriorDefault: boolean('has_interior_default').notNull().default(false),
    defaultEnvironment: text('default_environment', { enum: ENVIRONMENTS }),
    sortOrder: smallint('sort_order').notNull().default(100),
    archivedAt: tz('archived_at'),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('zone_type_code_uq').on(sql`coalesce(${t.gardenId}, '00000000-0000-0000-0000-000000000000'::uuid)`, t.code),
    index('zone_type_garden_idx').on(t.gardenId),
  ],
);

export const zone = pgTable(
  'zone',
  {
    id: id(),
    gardenId: uuid('garden_id')
      .notNull()
      .references(() => garden.id, { onDelete: 'cascade' }),
    parentId: uuid('parent_id'),
    zoneTypeId: uuid('zone_type_id')
      .notNull()
      .references(() => zoneType.id),
    name: text('name').notNull(),
    /** IDs des ancêtres séparés par « / » (vide pour une racine) */
    path: text('path').notNull().default(''),
    depth: smallint('depth').notNull().default(0),
    environment: text('environment', { enum: ENVIRONMENTS }),
    surfaceM2Manual: numeric('surface_m2_manual', { precision: 10, scale: 2, mode: 'number' }),
    lengthCm: integer('length_cm'),
    widthCm: integer('width_cm'),
    geometry: jsonb('geometry').$type<RectGeometry>(),
    /** Scène où la zone est dessinée : null = scène extérieure, sinon une zone « avec intérieur » */
    sceneZoneId: uuid('scene_zone_id'),
    hasInterior: boolean('has_interior').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    notes: text('notes'),
    archivedAt: tz('archived_at'),
    ...timestamps(),
  },
  (t) => [
    unique('zone_garden_id_id_uq').on(t.gardenId, t.id),
    foreignKey({ columns: [t.gardenId, t.parentId], foreignColumns: [t.gardenId, t.id], name: 'zone_parent_same_garden_fk' }),
    foreignKey({ columns: [t.gardenId, t.sceneZoneId], foreignColumns: [t.gardenId, t.id], name: 'zone_scene_same_garden_fk' }),
    check('zone_depth_max', sql`${t.depth} between 0 and 7`),
    check('zone_not_own_parent', sql`${t.parentId} is null or ${t.parentId} <> ${t.id}`),
    check('zone_surface_positive', sql`${t.surfaceM2Manual} is null or ${t.surfaceM2Manual} > 0`),
    check('zone_dims_positive', sql`(${t.lengthCm} is null or ${t.lengthCm} > 0) and (${t.widthCm} is null or ${t.widthCm} > 0)`),
    index('zone_garden_parent_idx').on(t.gardenId, t.parentId),
    index('zone_garden_path_idx').on(t.gardenId, sql`${t.path} text_pattern_ops`),
    index('zone_garden_scene_idx').on(t.gardenId, t.sceneZoneId),
    index('zone_type_idx').on(t.zoneTypeId),
  ],
);

export const zoneGroupPermission = pgTable(
  'zone_group_permission',
  {
    gardenId: uuid('garden_id').notNull(),
    zoneId: uuid('zone_id').notNull(),
    groupId: uuid('group_id').notNull(),
    level: text('level', { enum: ['edit', 'contribute'] }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.zoneId, t.groupId] }),
    foreignKey({ columns: [t.gardenId, t.zoneId], foreignColumns: [zone.gardenId, zone.id], name: 'zgp_zone_same_garden_fk' }).onDelete('cascade'),
    foreignKey({ columns: [t.gardenId, t.groupId], foreignColumns: [gardenGroup.gardenId, gardenGroup.id], name: 'zgp_group_same_garden_fk' }).onDelete('cascade'),
    index('zone_group_permission_group_idx').on(t.groupId),
    index('zone_group_permission_garden_idx').on(t.gardenId),
  ],
);

export const practice = pgTable('practice', {
  id: id(),
  code: text('code').notNull().unique(),
  category: text('category', { enum: ['method', 'soil', 'irrigation', 'biodiversity', 'other'] }).notNull(),
  sortOrder: smallint('sort_order').notNull().default(100),
  ...timestamps(),
});

export const practiceDeclaration = pgTable(
  'practice_declaration',
  {
    id: id(),
    gardenId: uuid('garden_id')
      .notNull()
      .references(() => garden.id, { onDelete: 'cascade' }),
    zoneId: uuid('zone_id'),
    practiceId: uuid('practice_id')
      .notNull()
      .references(() => practice.id),
    seasonId: uuid('season_id'),
    details: jsonb('details').$type<Record<string, string | number | boolean>>(),
    excluded: boolean('excluded').notNull().default(false),
    /** Renseigné au lot 8 quand la pratique est déclarée via un objet de déco */
    decorPlacementId: uuid('decor_placement_id'),
    ...timestamps(),
  },
  (t) => [
    foreignKey({ columns: [t.gardenId, t.zoneId], foreignColumns: [zone.gardenId, zone.id], name: 'practice_decl_zone_same_garden_fk' }).onDelete('cascade'),
    foreignKey({ columns: [t.gardenId, t.seasonId], foreignColumns: [season.gardenId, season.id], name: 'practice_decl_season_same_garden_fk' }).onDelete('cascade'),
    uniqueIndex('practice_declaration_uq').on(
      t.gardenId,
      sql`coalesce(${t.zoneId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
      t.practiceId,
      sql`coalesce(${t.seasonId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
    ),
    index('practice_declaration_garden_zone_idx').on(t.gardenId, t.zoneId),
    index('practice_declaration_practice_idx').on(t.practiceId),
    index('practice_declaration_season_idx').on(t.seasonId),
  ],
);
