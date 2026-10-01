import { loadReferenceData } from '../src/features/plant/reference/load';
import { createDb, createSql } from '../src/server/db/client';

/** Charge le référentiel végétal commun (à lancer aussi en production après les migrations). */
const url = process.argv[2] ?? process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL manquant');
const sql = createSql(url);
const db = createDb(sql);
await db.transaction((tx) => loadReferenceData(tx));
await sql.end();
console.log('Référentiel végétal chargé');
