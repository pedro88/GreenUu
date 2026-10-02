import { createDb, createSql } from '../src/server/db/client';
import { recomputeXp } from '../src/features/progression/service';

/**
 * RG-XP-08 : `pnpm xp:recompute [--user <id>] [--apply]`. Sans `--apply`, rapport des écarts seulement ; avec, ajout des
 * lignes de correction (`reason = recompute`) dans une transaction, après confirmation de l'admin qui lance la commande.
 */
const args = process.argv.slice(2);
const userId = args.includes('--user') ? args[args.indexOf('--user') + 1] : undefined;
const apply = args.includes('--apply');
const sql = createSql(process.env.DATABASE_URL ?? '');
const db = createDb(sql);
const report = await db.transaction((tx) => recomputeXp(tx, { ...(userId ? { userId } : {}), apply, now: new Date() }));
console.log(`${report.events} événements rejoués, ${report.users} utilisateurs, ${report.differences.length} écarts${apply ? ' corrigés' : ''}.`);
for (const d of report.differences.slice(0, 50)) console.log(`  ${d.userId} ${d.key} : attendu ${d.expected}, journal ${d.actual}`);
await sql.end();
