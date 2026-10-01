import { createDb, createSql } from '../src/server/db/client';
import { seed } from './seed-data';

const url = process.argv[2] ?? process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL manquant');
const reference = process.env.SEED_REFERENCE_DATE ? new Date(process.env.SEED_REFERENCE_DATE) : new Date();
const sql = createSql(url);
await seed(createDb(sql), reference);
await sql.end();
console.log(`Seed appliqué sur ${new URL(url).pathname.slice(1)} (référence ${reference.toISOString().slice(0, 10)})`);
