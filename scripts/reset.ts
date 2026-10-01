import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { createDb, createSql } from '../src/server/db/client';
import { seed } from './seed-data';

/** Remet une base à zéro (dev / test uniquement) : schémas supprimés, migrations, seed. */
const url = process.argv[2] ?? process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL manquant');
if (process.env.NODE_ENV === 'production') throw new Error('db:reset est interdit en production');
const sql = createSql(url);
await sql.unsafe('drop schema if exists public cascade; drop schema if exists drizzle cascade; drop schema if exists pgboss cascade; create schema public;');
const db = createDb(sql);
await migrate(db, { migrationsFolder: './drizzle' });
await seed(db, process.env.SEED_REFERENCE_DATE ? new Date(process.env.SEED_REFERENCE_DATE) : new Date());
await sql.end();
console.log(`Base ${new URL(url).pathname.slice(1)} réinitialisée`);
