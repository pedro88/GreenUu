import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { createDb, createSql } from '../src/server/db/client';

const url = process.argv[2] ?? process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL manquant');
const sql = createSql(url);
await migrate(createDb(sql), { migrationsFolder: './drizzle' });
await sql.end();
console.log(`Migrations appliquées sur ${new URL(url).pathname.slice(1)}`);
