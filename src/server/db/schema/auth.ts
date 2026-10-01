import { bigint, boolean, index, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { citext, id, timestamps, tz } from './_columns';

/* Tables attendues par Better Auth (adaptateur Drizzle). Les noms des propriétés JS sont ceux
   du schéma Better Auth ; les colonnes SQL sont en snake_case. */

export const user = pgTable('user', {
  id: id(),
  name: text('name').notNull(),
  email: citext('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  platformRole: text('platform_role', { enum: ['user', 'moderator', 'admin'] }).notNull().default('user'),
  ...timestamps(),
});

export const session = pgTable(
  'session',
  {
    id: id(),
    expiresAt: tz('expires_at').notNull(),
    token: text('token').notNull().unique(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    ...timestamps(),
  },
  (t) => [index('session_user_id_idx').on(t.userId)],
);

export const account = pgTable(
  'account',
  {
    id: id(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: tz('access_token_expires_at'),
    refreshTokenExpiresAt: tz('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    ...timestamps(),
  },
  (t) => [index('account_user_id_idx').on(t.userId)],
);

export const verification = pgTable(
  'verification',
  {
    id: id(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: tz('expires_at').notNull(),
    ...timestamps(),
  },
  (t) => [index('verification_identifier_idx').on(t.identifier)],
);

/** Compteurs de limitation de débit de Better Auth (stockage en base). */
export const rateLimit = pgTable('rate_limit', {
  id: id(),
  key: text('key').notNull().unique(),
  count: integer('count').notNull(),
  lastRequest: bigint('last_request', { mode: 'number' }).notNull(),
});
