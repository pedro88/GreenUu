import type { Executor } from '../db/client';
import { domainEvent } from '../db/schema';
import type { DomainEvent } from './types';

/**
 * Enregistre un événement dans l'outbox, dans la transaction de l'action (SPEC §3.5).
 * Les abonnés synchrones (XP, lot 6) seront appelés ici ; les asynchrones lisent l'outbox.
 */
export async function emit(tx: Executor, event: DomainEvent, occurredAt: Date = new Date()): Promise<void> {
  await tx.insert(domainEvent).values({
    type: event.type,
    subjectType: event.subjectType,
    subjectId: event.subjectId,
    gardenId: event.gardenId,
    actorId: event.actorId,
    payload: event.payload,
    occurredAt,
  });
}
