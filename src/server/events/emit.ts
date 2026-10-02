import type { Executor } from '../db/client';
import { domainEvent } from '../db/schema';
import type { DomainEvent } from './types';

export type EmittedEvent = typeof domainEvent.$inferSelect;
/** Abonné synchrone : appelé dans la transaction de l'action, juste après l'enregistrement de l'événement. */
export type EmitHook = (tx: Executor, event: EmittedEvent) => Promise<void>;

const hooks: EmitHook[] = [];

/** Enregistre un abonné synchrone (XP, lot 6). Idempotent : un même abonné n'est enregistré qu'une fois. */
export function onEmit(hook: EmitHook) {
  if (!hooks.includes(hook)) hooks.push(hook);
}

/**
 * Enregistre un événement dans l'outbox, dans la transaction de l'action (SPEC §3.5), puis appelle les abonnés
 * synchrones. Les abonnés asynchrones lisent l'outbox (`outbox.dispatch`).
 */
export async function emit(tx: Executor, event: DomainEvent, occurredAt: Date = new Date()): Promise<void> {
  const [row] = await tx.insert(domainEvent).values({
    type: event.type,
    subjectType: event.subjectType,
    subjectId: event.subjectId,
    gardenId: event.gardenId,
    actorId: event.actorId,
    payload: event.payload,
    occurredAt,
  }).returning();
  if (row) for (const h of hooks) await h(tx, row);
}
