import { PgBoss } from 'pg-boss';
import { createDb, createSql } from '../db/client';
import { env } from '../env';
import type { Mail } from '../mail/templates';
import type { JobQueue } from './queues';
import { BOSS_SCHEMA } from './boss';
import { dispatchOutbox, housekeeping, sendMail } from './handlers';
import { dailyDigest, dueReminders, materializeAllSeries } from '../../features/ticket/jobs';
import { refreshSharedFacts } from '../../features/reco/facts';
import { buildExport, purgeDeletedAccounts } from '../../features/privacy/service';
import { storage } from '../storage/storage';
import { appClock } from '../clock';
import { fromDrizzle } from 'pg-boss';
import { sql as dsql } from 'drizzle-orm';

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
  await boss.createQueue('tickets.materialize-recurrences', { policy: 'singleton' });
  await boss.createQueue('tickets.due-reminders', { policy: 'singleton' });
  await boss.createQueue('notifications.daily-digest', { policy: 'singleton' });
  await boss.createQueue('reco.refresh-facts', { policy: 'singleton' });
  await boss.createQueue('privacy.export', { retryLimit: 3, retryBackoff: true });
  await boss.createQueue('privacy.purge', { policy: 'singleton' });
  // Les e-mails de notification sont mis en file dans la transaction du job (pas d'envoi si elle échoue).
  const txQueue = (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]): JobQueue => ({
    enqueue: async (name, data, opts = {}) => { await boss.send(name, data, { db: fromDrizzle(tx, dsql), ...opts }); },
  });

  await boss.work<Mail>('mail.send', async (jobs) => {
    for (const job of jobs) await sendMail(job.data);
  });
  await boss.work('outbox.dispatch', async () => {
    while ((await dispatchOutbox(db)) > 0) {
      /* vide l'outbox par lots */
    }
  });
  await boss.work('housekeeping', async () => housekeeping(db, new Date()));
  await boss.work('tickets.materialize-recurrences', async () => { await materializeAllSeries(db, new Date()); });
  await boss.work('tickets.due-reminders', async () => { await db.transaction((tx) => dueReminders(tx, txQueue(tx), e.APP_URL, new Date())); });
  await boss.work('notifications.daily-digest', async () => { await db.transaction((tx) => dailyDigest(tx, txQueue(tx), e.APP_URL, new Date())); });

  await boss.work('reco.refresh-facts', async () => { await refreshSharedFacts(db); });
  await boss.work<{ exportId: string }>('privacy.export', async (jobs) => {
    for (const job of jobs) await db.transaction((tx) => buildExport({ tx, clock: appClock(), jobs: txQueue(tx), appUrl: e.APP_URL }, job.data.exportId, storage()));
  });
  await boss.work('privacy.purge', async () => { await db.transaction((tx) => purgeDeletedAccounts(tx, storage(), appClock().now())); });

  await boss.schedule('outbox.dispatch', '* * * * *');
  await boss.schedule('reco.refresh-facts', '10 * * * *');
  await boss.schedule('privacy.purge', '45 3 * * *', undefined, { tz: 'Europe/Paris' });
  await boss.schedule('housekeeping', '30 3 * * *', undefined, { tz: 'Europe/Paris' });
  await boss.schedule('tickets.materialize-recurrences', '5 * * * *');
  await boss.schedule('tickets.due-reminders', '*/15 * * * *');
  await boss.schedule('notifications.daily-digest', '0 * * * *');

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
