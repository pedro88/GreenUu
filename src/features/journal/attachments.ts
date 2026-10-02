import { and, eq, inArray, isNull } from 'drizzle-orm';
import { validation } from '@/lib/errors';
import type { Scope } from '@/server/authz/scope';
import type { Executor } from '@/server/db/client';
import { attachment } from '@/server/db/schema';

/**
 * Rattache des photos « en attente » à une entrée de journal ou à un ticket. Chaque photo doit appartenir
 * au jardin, avoir été téléversée par l'acteur et n'être rattachée à rien d'autre.
 */
export async function claimAttachments(tx: Executor, scope: Scope, actorId: string, ids: string[], target: { journalEntryId: string } | { ticketId: string }) {
  if (ids.length === 0) return 0;
  const rows = await tx.select({ id: attachment.id }).from(attachment).where(and(
    eq(attachment.gardenId, scope.gardenId), inArray(attachment.id, ids), eq(attachment.uploadedBy, actorId),
    isNull(attachment.journalEntryId), isNull(attachment.ticketId), isNull(attachment.ticketCommentId), isNull(attachment.deletedAt),
  ));
  if (rows.length !== new Set(ids).size) throw validation({ attachmentIds: ['attachmentInvalid'] });
  await tx.update(attachment).set(target).where(inArray(attachment.id, rows.map((r) => r.id)));
  return rows.length;
}
