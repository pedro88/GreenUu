import { eq } from 'drizzle-orm';
import { conflict } from '@/lib/errors';
import type { Executor } from './db/client';
import type { harvest, journalEntry } from './db/schema';

/*
 * Saisies hors-ligne (SPEC §4.1, D-15, §12.10 OFF) : un ID fourni par le client sert de clé d'idempotence. Il ne donne
 * aucun droit : l'autorisation est toujours appliquée, et un ID déjà pris par la saisie d'un autre jardin ou d'un autre
 * auteur donne `CONFLICT`, sans rien révéler de l'existant.
 */

/** Recul maximal accepté pour l'instant de saisie d'une action mise en file. */
export const MAX_CAPTURE_AGE_DAYS = 7;

/** L'entrée existe déjà pour ce jardin et cet auteur (renvoi après une réponse perdue) : son ID ; sinon null. */
export async function replayOf(tx: Executor, table: typeof journalEntry | typeof harvest, clientId: string, gardenId: string, authorId: string): Promise<string | null> {
  const [row] = await tx.select({ id: table.id, gardenId: table.gardenId, authorId: table.authorId }).from(table).where(eq(table.id, clientId)).limit(1);
  if (!row) return null;
  if (row.gardenId !== gardenId || row.authorId !== authorId) throw conflict('clientIdTaken');
  return row.id;
}

/** Instant de l'événement d'une saisie mise en file : l'instant de saisie, borné à [maintenant − 7 j, maintenant]. */
export function captureInstant(capturedAt: string | undefined, now: Date): Date {
  if (!capturedAt) return now;
  const t = Date.parse(capturedAt);
  if (Number.isNaN(t)) return now;
  return new Date(Math.min(now.getTime(), Math.max(now.getTime() - MAX_CAPTURE_AGE_DAYS * 86_400_000, t)));
}
