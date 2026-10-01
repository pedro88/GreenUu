import { PgBoss } from 'pg-boss';
import { createDb, createSql } from '../db/client';
import { env } from '../env';
import type { Mail } from '../mail/templates';
import { BOSS_SCHEMA } from './boss';
import { dispatchOutbox, housekeeping, sendMail } from './handlers';

/** Processus worker (`pnpm worker`) : files pg-boss et tâches planifiées (SPEC §3.6). */
async function main() {
  const e = env();
  const sql = createSql(e.DATABASE_URL);
  const db = createDb(sql);
  const boss = new PgBoss({ connectionString: e.DATABASE_URL, schema: BOSS_SCHEMA });
  boss.on('error', (err: unknown) => console.error('[worker]', err));
  await boss.start();

  await boss.createQueue('mail.send', { retryLimit: 5, retryBackoff: true, retryDelay: 30, deleteAfterSeconds: 3600 });
  await boss.createQueue('outbox.dispatch', { policy: 'singleton' });
  await boss.createQueue('housekeeping', { policy: 'singleton' });

  await boss.work<Mail>('mail.send', async (jobs) => {
    for (const job of jobs) await sendMail(job.data);
  });
  await boss.work('outbox.dispatch', async () => {
    while ((await dispatchOutbox(db)) > 0) {
      /* vide l'outbox par lots */
    }
  });
  await boss.work('housekeeping', async () => housekeeping(db, new Date()));

  await boss.schedule('outbox.dispatch', '* * * * *');
  await boss.schedule('housekeeping', '30 3 * * *', undefined, { tz: 'Europe/Paris' });

  console.log('[worker] prêt');
  const stop = async () => {
    await boss.stop({ graceful: true });
    await sql.end();
    process.exit(0);
  };
  process.on('SIGINT', () => void stop());
  process.on('SIGTERM', () => void stop());
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
