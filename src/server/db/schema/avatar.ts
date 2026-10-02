import { boolean, index, integer, jsonb, pgTable, primaryKey, smallint, text, uuid } from 'drizzle-orm/pg-core';
import type { AvatarConfigV1 } from '@/features/avatar/config.pure';
import type { UnlockConditionV1 } from '@/features/progression/unlock.pure';
import { AVATAR_LAYERS, PALETTE_SLOTS, type PaletteSlot } from '@/lib/enums';
import { id, timestamps } from './_columns';
import { user } from './auth';

/* Avatar (SPEC §4.2.6, §10). Le catalogue est défini en code et chargé avec le référentiel (identifiants stables). */

export const avatarItem = pgTable(
  'avatar_item',
  {
    id: id(),
    code: text('code').notNull().unique(),
    layer: text('layer', { enum: AVATAR_LAYERS }).notNull(),
    spriteKey: text('sprite_key').notNull(),
    /** Types d'emplacement de couleur, dans l'ordre des palettes de la configuration (au plus 2). */
    paletteSlots: jsonb('palette_slots').$type<PaletteSlot[]>().notNull().default([]),
    unlockCondition: jsonb('unlock_condition').$type<UnlockConditionV1>().notNull(),
    defaultUnlocked: boolean('default_unlocked').notNull().default(false),
    sortOrder: smallint('sort_order').notNull().default(100),
    ...timestamps(),
  },
  (t) => [index('avatar_item_layer_idx').on(t.layer, t.sortOrder)],
);

export const palette = pgTable('palette', {
  id: id(),
  code: text('code').notNull().unique(),
  slotKind: text('slot_kind', { enum: PALETTE_SLOTS }).notNull(),
  /** 4 couleurs `#rrggbb`, de la plus claire à la plus sombre (§10.2). */
  ramp: jsonb('ramp').$type<string[]>().notNull(),
  sortOrder: smallint('sort_order').notNull().default(100),
  ...timestamps(),
});

export const avatarItemPalette = pgTable(
  'avatar_item_palette',
  {
    avatarItemId: uuid('avatar_item_id').notNull().references(() => avatarItem.id, { onDelete: 'cascade' }),
    paletteId: uuid('palette_id').notNull().references(() => palette.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.avatarItemId, t.paletteId] }), index('avatar_item_palette_palette_idx').on(t.paletteId)],
);

export const userAvatar = pgTable('user_avatar', {
  userId: uuid('user_id').primaryKey().references(() => user.id, { onDelete: 'cascade' }),
  /** Nombre d'enregistrements : 0 pour l'avatar par défaut attribué à l'inscription. */
  configVersion: integer('config_version').notNull().default(0),
  config: jsonb('config').$type<AvatarConfigV1>().notNull(),
  /** sha256 du JSON canonique : clé des vignettes en cache (§10.5). */
  configHash: text('config_hash').notNull(),
  ...timestamps(),
});
