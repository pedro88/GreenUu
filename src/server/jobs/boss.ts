import { sql } from 'drizzle-orm';
import { fromDrizzle, PgBoss } from 'pg-boss';
import type { Executor } from '../db/client';
import { env } from '../env';
import type { JobName, JobPayloads, JobQueue } from './queues';

export const BOSS_SCHEMA = 'pgboss';

let producer: Promise<PgBoss> | undefined;

/** Instance « producteur » dans le processus Next : pas de maintenance ni de planification. */
function getProducer(): Promise<PgBoss> {
  producer ??= (async () => {
    const boss = new PgBoss({
      connectionString: env().DATABASE_URL,
      schema: BOSS_SCHEMA,
      max: 2,
      supervise: false,
      schedule: false,
      migrate: false,
      createSchema: false,
    });
    boss.on('error', (err: unknown) => console.error('[pg-boss]', err));
    await boss.start();
    return boss;
  })();
  return producer;
}

/** File de jobs liée à une transaction : le job n'existe que si la transaction est validée. */
export function transactionalQueue(tx: Executor): JobQueue {
  return {
    async enqueue<N extends JobName>(name: N, data: JobPayloads[N]) {
      const boss = await getProducer();
      await boss.send(name, data, { db: fromDrizzle(tx, sql) });
    },
  };
}
