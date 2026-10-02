import { and, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import type { Db, Executor } from '../db/client';
import { attachment, domainEvent, gardenInvitation, session } from '../db/schema';
import { storage, type FileStorage } from '../storage/storage';
import { sendMailNow } from '../mail/transport';
import type { Mail } from '../mail/templates';

/** Abonnés asynchrones par type d'événement (vides au lot 1 : notifications, XP… arrivent aux lots suivants). */
type Subscriber = (db: Db, event: typeof domainEvent.$inferSelect) => Promise<void>;
export const ASYNC_SUBSCRIBERS: Partial<Record<string, Subscriber[]>> = {};

/** Distribue les événements non encore distribués, par lots, de façon idempotente (SPEC §3.5). */
export async function dispatchOutbox(db: Db, batchSize = 200): Promise<number> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(domainEvent)
      .where(isNull(domainEvent.dispatchedAt))
      .orderBy(domainEvent.occurredAt)
      .limit(batchSize)
      .for('update', { skipLocked: true });
    for (const ev of rows) {
      for (const sub of ASYNC_SUBSCRIBERS[ev.type] ?? []) await sub(db, ev);
    }
    if (rows.length > 0) {
      await tx.update(domainEvent).set({ dispatchedAt: sql`now()` }).where(inArray(domainEvent.id, rows.map((r) => r.id)));
    }
    return rows.length;
  });
}

export async function sendMail(mail: Mail): Promise<void> {
  await sendMailNow(mail);
}

/** Purge quotidienne (SPEC §3.6) : sessions expirées, invitations expirées depuis 30 jours, photos orphelines. */
export async function housekeeping(db: Executor, now: Date, files: FileStorage = storage()): Promise<void> {
  await db.delete(session).where(lt(session.expiresAt, now));
  const cutoff = new Date(now.getTime() - 30 * 86_400_000);
  await db.delete(gardenInvitation).where(and(
    or(lt(gardenInvitation.expiresAt, cutoff), lt(gardenInvitation.revokedAt, cutoff)),
    isNull(gardenInvitation.acceptedAt),
  ));
  // Photos téléversées mais rattachées à RIEN (ni entrée de journal, ni ticket, ni commentaire) depuis un jour (RG-JRN-03).
  const stale = await db.delete(attachment)
    .where(and(isNull(attachment.journalEntryId), isNull(attachment.ticketId), isNull(attachment.ticketCommentId), lt(attachment.createdAt, new Date(now.getTime() - 86_400_000))))
    .returning({ key: attachment.storageKey });
  for (const s of stale) await files.remove(s.key);
}
