import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
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
import { citext, createdAt, id, timestamps, tz } from './_columns';
import { user } from './auth';

import { ENVIRONMENTS, EXPOSURES, GARDEN_ROLES, NON_OWNER_ROLES, ORG_TYPES, SOIL_TYPES, WATER_ACCESS } from '@/lib/enums';

export { ENVIRONMENTS, EXPOSURES, GARDEN_ROLES, NON_OWNER_ROLES, ORG_TYPES, SOIL_TYPES, WATER_ACCESS };

/* ---------- Profil, consentements ---------- */

export const userProfile = pgTable('user_profile', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  pseudo: citext('pseudo').notNull().unique(),
  locale: text('locale').notNull().default('fr'),
  timezone: text('timezone').notNull().default('Europe/Paris'),
  defaultView: text('default_view', { enum: ['garden', 'classic'] }).notNull().default('classic'),
  reducedMotion: boolean('reduced_motion').notNull().default(false),
  profileVisibility: text('profile_visibility', { enum: ['public', 'members', 'private'] })
    .notNull()
    .default('members'),
  deletionRequestedAt: tz('deletion_requested_at'),
  ...timestamps(),
});

export const consent = pgTable(
  'consent',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['terms', 'share_results', 'marketing'] }).notNull(),
    version: text('version').notNull(),
    /** Jardin concerné pour `share_results` (consentement donné par l'owner). */
    gardenId: uuid('garden_id'),
    grantedAt: tz('granted_at').notNull().defaultNow(),
    revokedAt: tz('revoked_at'),
    ...timestamps(),
  },
  (t) => [index('consent_user_id_idx').on(t.userId), index('consent_garden_id_idx').on(t.gardenId)],
);

/* ---------- Jardin ---------- */

export const garden = pgTable(
  'garden',
  {
    id: id(),
    name: text('name').notNull(),
    orgType: text('org_type', { enum: ORG_TYPES }).notNull(),
    lat: numeric('lat', { precision: 9, scale: 6, mode: 'number' }).notNull(),
    lng: numeric('lng', { precision: 9, scale: 6, mode: 'number' }).notNull(),
    geohash4: text('geohash4').notNull(),
    placeLabel: text('place_label'),
    altitudeM: integer('altitude_m'),
    koppen: text('koppen'),
    hardinessZone: text('hardiness_zone'),
    soilType: text('soil_type', { enum: SOIL_TYPES }).notNull().default('unknown'),
    soilPh: numeric('soil_ph', { precision: 3, scale: 1, mode: 'number' }),
    exposure: text('exposure', { enum: EXPOSURES }),
    waterAccess: text('water_access', { enum: WATER_ACCESS }),
    timezone: text('timezone').notNull(),
    seasonStartMonth: smallint('season_start_month').notNull().default(1),
    tileSizeCm: integer('tile_size_cm').notNull().default(50),
    planEditMinRole: text('plan_edit_min_role', { enum: GARDEN_ROLES }).notNull(),
    decorMinRole: text('decor_min_role', { enum: GARDEN_ROLES }).notNull().default('member'),
    leaderboardEnabled: boolean('leaderboard_enabled').notNull().default(false),
    shareResults: boolean('share_results').notNull().default(false),
    planVersion: integer('plan_version').notNull().default(0),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => user.id),
    archivedAt: tz('archived_at'),
    deletedAt: tz('deleted_at'),
    purgeAfter: tz('purge_after'),
    ...timestamps(),
  },
  (t) => [
    check('garden_lat_range', sql`${t.lat} between -90 and 90`),
    check('garden_lng_range', sql`${t.lng} between -180 and 180`),
    check('garden_ph_range', sql`${t.soilPh} is null or ${t.soilPh} between 0 and 14`),
    check('garden_season_month', sql`${t.seasonStartMonth} between 1 and 12`),
    index('garden_created_by_idx').on(t.createdBy),
  ],
);

export const gardenEnvironment = pgTable(
  'garden_environment',
  {
    gardenId: uuid('garden_id')
      .notNull()
      .references(() => garden.id, { onDelete: 'cascade' }),
    environment: text('environment', { enum: ENVIRONMENTS }).notNull(),
    position: smallint('position').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.gardenId, t.environment] })],
);

/* ---------- Membres, invitations, groupes ---------- */

export const gardenMember = pgTable(
  'garden_member',
  {
    id: id(),
    gardenId: uuid('garden_id')
      .notNull()
      .references(() => garden.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id),
    role: text('role', { enum: GARDEN_ROLES }).notNull(),
    joinedAt: tz('joined_at').notNull().defaultNow(),
    leftAt: tz('left_at'),
    removedBy: uuid('removed_by').references(() => user.id),
    ...timestamps(),
  },
  (t) => [
    unique('garden_member_garden_id_id_uq').on(t.gardenId, t.id),
    uniqueIndex('garden_member_active_uq').on(t.gardenId, t.userId).where(sql`${t.leftAt} is null`),
    uniqueIndex('garden_member_one_owner_uq')
      .on(t.gardenId)
      .where(sql`${t.leftAt} is null and ${t.role} = 'owner'`),
    index('garden_member_user_active_idx').on(t.userId).where(sql`${t.leftAt} is null`),
    index('garden_member_removed_by_idx').on(t.removedBy),
  ],
);

export const gardenInvitation = pgTable(
  'garden_invitation',
  {
    id: id(),
    gardenId: uuid('garden_id')
      .notNull()
      .references(() => garden.id, { onDelete: 'cascade' }),
    email: citext('email').notNull(),
    role: text('role', { enum: NON_OWNER_ROLES }).notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    invitedBy: uuid('invited_by')
      .notNull()
      .references(() => user.id),
    groupIds: jsonb('group_ids').$type<string[]>().notNull().default([]),
    expiresAt: tz('expires_at').notNull(),
    acceptedAt: tz('accepted_at'),
    acceptedBy: uuid('accepted_by').references(() => user.id),
    revokedAt: tz('revoked_at'),
    ...timestamps(),
  },
  (t) => [
    index('garden_invitation_garden_email_idx').on(t.gardenId, t.email),
    uniqueIndex('garden_invitation_active_uq')
      .on(t.gardenId, t.email)
      .where(sql`${t.acceptedAt} is null and ${t.revokedAt} is null`),
    index('garden_invitation_invited_by_idx').on(t.invitedBy),
    index('garden_invitation_accepted_by_idx').on(t.acceptedBy),
  ],
);

/** Table `garden_group` (le mot `group` est réservé en SQL). Entité « groupe » de la spec. */
export const gardenGroup = pgTable(
  'garden_group',
  {
    id: id(),
    gardenId: uuid('garden_id')
      .notNull()
      .references(() => garden.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color').notNull().default('green'),
    archivedAt: tz('archived_at'),
    ...timestamps(),
  },
  (t) => [
    unique('garden_group_garden_id_id_uq').on(t.gardenId, t.id),
    uniqueIndex('garden_group_active_name_uq').on(t.gardenId, sql`lower(${t.name})`).where(sql`${t.archivedAt} is null`),
  ],
);

export const groupMember = pgTable(
  'group_member',
  {
    gardenId: uuid('garden_id').notNull(),
    groupId: uuid('group_id').notNull(),
    memberId: uuid('member_id').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.groupId, t.memberId] }),
    foreignKey({ columns: [t.gardenId, t.groupId], foreignColumns: [gardenGroup.gardenId, gardenGroup.id], name: 'group_member_group_same_garden_fk' }).onDelete('cascade'),
    foreignKey({ columns: [t.gardenId, t.memberId], foreignColumns: [gardenMember.gardenId, gardenMember.id], name: 'group_member_member_same_garden_fk' }).onDelete('cascade'),
    index('group_member_member_idx').on(t.memberId),
    index('group_member_garden_idx').on(t.gardenId),
  ],
);

/* ---------- Saisons ---------- */

export const season = pgTable(
  'season',
  {
    id: id(),
    gardenId: uuid('garden_id')
      .notNull()
      .references(() => garden.id, { onDelete: 'cascade' }),
    year: integer('year').notNull(),
    startsOn: date('starts_on', { mode: 'string' }).notNull(),
    endsOn: date('ends_on', { mode: 'string' }).notNull(),
    status: text('status', { enum: ['planned', 'active', 'closed'] }).notNull(),
    ...timestamps(),
  },
  (t) => [
    unique('season_garden_year_uq').on(t.gardenId, t.year),
    check('season_dates', sql`${t.startsOn} < ${t.endsOn}`),
    unique('season_garden_id_id_uq').on(t.gardenId, t.id),
  ],
);
