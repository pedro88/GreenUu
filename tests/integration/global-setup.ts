import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { createDb, createSql } from '../../src/server/db/client';
import { loadReferenceData } from '../../src/features/plant/reference/load';
import { testEnv } from './env';

/** Applique les migrations sur la base de test avant la suite. */
export default async function setup() {
  const sql = createSql(testEnv().DATABASE_URL ?? '');
  const db = createDb(sql);
  await migrate(db, { migrationsFolder: './drizzle' });
  await db.transaction((tx) => loadReferenceData(tx));
  await sql.end();
}
