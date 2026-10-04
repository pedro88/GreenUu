'use client';

import type { ActionResult } from '@/lib/errors';
import { enqueue, isNetworkError, type OutboxKind } from '@/lib/client/outbox';

/*
 * Saisie rapide résiliente (SPEC §12.10, OFF-02) : chaque saisie porte un ID client et son instant de saisie. Si le
 * réseau manque (hors-ligne déclaré, ou appel qui échoue), elle part dans la file IndexedDB et sera rejouée par
 * `OfflineSync` ; le résultat indique alors `queued`.
 */

export type Queued = { queued: true };
type Action<I, R> = (input: I) => Promise<ActionResult<R>>;

export function withOutbox<I extends Record<string, unknown>, R>(kind: OutboxKind, action: Action<I, R>, label: (input: I) => string): Action<I, R | Queued> {
  return async (input) => {
    const id = crypto.randomUUID();
    const full = { ...input, clientId: id, capturedAt: new Date().toISOString() };
    const queue = async (): Promise<ActionResult<Queued>> => {
      await enqueue({ id, kind, input: full, label: label(input) });
      return { ok: true, data: { queued: true } };
    };
    if (typeof navigator !== 'undefined' && !navigator.onLine) return queue();
    try {
      return await action(full);
    } catch (e) {
      if (isNetworkError(e)) return queue();
      throw e;
    }
  };
}

export const isQueued = (d: unknown): d is Queued => typeof d === 'object' && d !== null && 'queued' in d;
