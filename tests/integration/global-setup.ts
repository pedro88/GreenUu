import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { createDb, createSql } from '../../src/server/db/client';
import { testEnv } from './env';

/** Applique les migrations sur la base de test avant la suite. */
export default async function setup() {
  const sql = createSql(testEnv().DATABASE_URL ?? '');
  await migrate(createDb(sql), { migrationsFolder: './drizzle' });
  await sql.end();
}
