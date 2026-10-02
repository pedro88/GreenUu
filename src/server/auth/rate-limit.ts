import { eq, sql } from 'drizzle-orm';
import { DomainError } from '@/lib/errors';
import type { Executor } from '../db/client';
import { rateLimit } from '../db/schema';

/** Fenêtre fixe par clé, stockée dans `rate_limit` (RG-AUTH-03). */
export type Limit = { key: string; max: number; windowMs: number };

export async function isLimited(tx: Executor, limit: Limit, nowMs: number): Promise<boolean> {
  const [row] = await tx.select().from(rateLimit).where(eq(rateLimit.key, limit.key)).limit(1);
  if (!row) return false;
  return nowMs - row.lastRequest < limit.windowMs && row.count >= limit.max;
}

/** Incrémente le compteur ; repart à 1 si la fenêtre est écoulée. */
export async function hit(tx: Executor, limit: Limit, nowMs: number): Promise<void> {
  await tx
    .insert(rateLimit)
    .values({ key: limit.key, count: 1, lastRequest: nowMs })
    .onConflictDoUpdate({
      target: rateLimit.key,
      set: {
        count: sql`case when ${nowMs} - ${rateLimit.lastRequest} >= ${limit.windowMs} then 1 else ${rateLimit.count} + 1 end`,
        lastRequest: sql`case when ${nowMs} - ${rateLimit.lastRequest} >= ${limit.windowMs} then ${nowMs} else ${rateLimit.lastRequest} end`,
      },
    });
}

export async function reset(tx: Executor, key: string): Promise<void> {
  await tx.delete(rateLimit).where(eq(rateLimit.key, key));
}

export const loginLimit = (email: string): Limit => ({ key: `login:${email.toLowerCase()}`, max: 5, windowMs: 15 * 60_000 });
export const resetLimit = (email: string): Limit => ({ key: `reset:${email.toLowerCase()}`, max: 3, windowMs: 60 * 60_000 });

/** Plafonds horaires par utilisateur des contenus communautaires (audit lot 4, M2). */
export const CONTENT_LIMITS = { tip: 10, guide: 5, vote: 120, report: 20 } as const;
export const contentLimit = (kind: keyof typeof CONTENT_LIMITS, userId: string): Limit => ({ key: `${kind}:${userId}`, max: CONTENT_LIMITS[kind], windowMs: 60 * 60_000 });

/** Compte l'action et la refuse (`RATE_LIMITED`) une fois le plafond atteint dans la fenêtre. */
export async function consume(tx: Executor, limit: Limit, nowMs: number): Promise<void> {
  if (await isLimited(tx, limit, nowMs)) throw new DomainError('RATE_LIMITED', 'contentRateLimited');
  await hit(tx, limit, nowMs);
}
