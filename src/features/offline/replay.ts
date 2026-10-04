'use client';

import { listOutbox, markRejected, removeFromOutbox, isNetworkError, type OutboxItem } from '@/lib/client/outbox';
import { recordHarvestAction } from '../harvest/actions';
import { createJournalEntryAction } from '../journal/actions';

/* Rejeu de la file (OFF-02, OFF-05) : dans l'ordre de saisie ; une erreur réseau arrête le rejeu, un refus marque la saisie. */

let running: Promise<void> | null = null;

async function send(item: OutboxItem) {
  // as: l'entrée a été construite par la saisie rapide pour cette action, et le serveur la revalide entièrement.
  if (item.kind === 'journal') return createJournalEntryAction(item.input as Parameters<typeof createJournalEntryAction>[0]);
  return recordHarvestAction(item.input as Parameters<typeof recordHarvestAction>[0]); // as: idem
}

export function replayOutbox(): Promise<void> {
  running ??= (async () => {
    try {
      for (const item of await listOutbox()) {
        if (item.status !== 'pending') continue;
        let result: Awaited<ReturnType<typeof send>>;
        try {
          result = await send(item);
        } catch (e) {
          if (isNetworkError(e)) return;
          await markRejected(item, 'internal');
          continue;
        }
        if (result.ok) await removeFromOutbox(item.id);
        else await markRejected(item, result.error.message);
      }
    } finally {
      running = null;
    }
  })();
  return running;
}
