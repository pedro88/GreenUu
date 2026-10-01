import { sql } from 'drizzle-orm';
import { customType, timestamp, uuid } from 'drizzle-orm/pg-core';

/** Clé primaire UUID v7 générée par PostgreSQL 18 (SPEC §4.1). */
export const id = () => uuid('id').primaryKey().default(sql`uuidv7()`);

export const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

/** Mis à jour par le trigger `set_updated_at` (migration personnalisée) et côté ORM. */
export const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

export const timestamps = () => ({ createdAt: createdAt(), updatedAt: updatedAt() });

export const tz = (name: string) => timestamp(name, { withTimezone: true });

/** Extension `citext` : e-mails et pseudos insensibles à la casse. */
export const citext = customType<{ data: string }>({ dataType: () => 'citext' });
