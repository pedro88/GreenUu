import { afterAll } from 'vitest';
import type { Actor, ScopedCtx, ServiceCtx } from '../../src/server/action-core';
import { loadScope } from '../../src/server/authz/scope';
import { fixedClock, type Clock } from '../../src/server/clock';
import { createDb, createSql, type Db, type Tx } from '../../src/server/db/client';
import { user, userProfile } from '../../src/server/db/schema';
import type { JobName, JobPayloads, JobQueue } from '../../src/server/jobs/queues';
import { testEnv } from './env';

const sql = createSql(testEnv().DATABASE_URL ?? '');
export const testDb: Db = createDb(sql);
afterAll(async () => {
  await sql.end();
});

class Rollback extends Error {}

/** Exécute `fn` dans une transaction toujours annulée : chaque test part d'une base propre. */
export async function inTx(fn: (tx: Tx) => Promise<void>): Promise<void> {
  try {
    await testDb.transaction(async (tx) => {
      await fn(tx);
      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
}

export type RecordedJob = { name: JobName; data: JobPayloads[JobName] };

export function recordingQueue(): JobQueue & { jobs: RecordedJob[] } {
  const jobs: RecordedJob[] = [];
  return {
    jobs,
    async enqueue(name, data) {
      jobs.push({ name, data });
    },
  };
}

export const NOW = new Date('2026-06-15T09:00:00+02:00');

let seq = 0;

/** Crée un utilisateur (sans Better Auth : pas besoin de mot de passe pour les tests de service). */
export async function makeUser(tx: Tx, opts: { pseudo?: string; email?: string; verified?: boolean } = {}): Promise<Actor> {
  seq += 1;
  const pseudo = opts.pseudo ?? `user${seq}${Math.random().toString(36).slice(2, 6)}`;
  const email = opts.email ?? `${pseudo}@test.local`;
  const [u] = await tx.insert(user).values({ name: pseudo, email, emailVerified: opts.verified ?? true }).returning();
  if (!u) throw new Error('user');
  await tx.insert(userProfile).values({ userId: u.id, pseudo });
  return { id: u.id, email, name: pseudo, emailVerified: u.emailVerified, platformRole: 'user', timezone: 'Europe/Paris' };
}

export function ctxFor(tx: Tx, actor: Actor, opts: { clock?: Clock; jobs?: JobQueue } = {}): ServiceCtx {
  return { tx, actor, clock: opts.clock ?? fixedClock(NOW), jobs: opts.jobs ?? recordingQueue(), appUrl: 'http://localhost:3000' };
}

export async function scopedCtx(tx: Tx, actor: Actor, gardenId: string, opts: { clock?: Clock; jobs?: JobQueue } = {}): Promise<ScopedCtx> {
  const scope = await loadScope(tx, actor.id, gardenId);
  if (!scope) throw new Error(`${actor.name} n'est pas membre du jardin`);
  return { ...ctxFor(tx, actor, opts), scope };
}
