import { and, eq, inArray, isNull } from 'drizzle-orm';
import { forbidden, notFound, validation } from '@/lib/errors';
import { addDays } from '@/lib/dates';
import { hasExif, imageSize, sniffImage, stripJpegMetadata } from '@/lib/images';
import type { ScopedCtx } from '@/server/action-core';
import { can, type Scope } from '@/server/authz/scope';
import type { Executor } from '@/server/db/client';
import { attachment, culture, journalEntry, problem } from '@/server/db/schema';
import { emit } from '@/server/events/emit';
import type { FileStorage } from '@/server/storage/storage';
import { completeWateringTickets } from '../ticket/service';
import { assertZoneContribute } from '../zone/service';
import type { JournalCreateInput } from './schema';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGE_SIDE = 4096;
export const BACKDATE_DAYS = 30;

/** Zone de rattachement (directe ou via la culture) pour le contrôle de restriction. */
async function targetZone(tx: Executor, scope: Scope, input: { cultureId?: string | undefined; zoneId?: string | undefined }) {
  if (input.cultureId) {
    const [c] = await tx.select({ zoneId: culture.zoneId }).from(culture)
      .where(and(eq(culture.gardenId, scope.gardenId), eq(culture.id, input.cultureId), isNull(culture.deletedAt))).limit(1);
    if (!c) throw notFound('cultureNotFound');
    return c.zoneId;
  }
  if (!input.zoneId) throw validation({ cultureId: ['oneTarget'] });
  return input.zoneId;
}

/** RG-JRN-01 à 03 : entrée de journal (avec photos préalablement téléversées). */
export async function createJournalEntry(ctx: ScopedCtx, input: JournalCreateInput) {
  const { tx, scope, actor, clock } = ctx;
  await assertZoneContribute(tx, scope, 'journal:create', await targetZone(tx, scope, input));
  const now = clock.now();
  const observedAt = input.observedAt ? new Date(input.observedAt) : now;
  if (observedAt.getTime() > now.getTime() + 60_000) throw validation({ observedAt: ['futureDate'] });
  if (observedAt.getTime() < addDays(now, -BACKDATE_DAYS).getTime()) throw validation({ observedAt: ['tooOld'] });
  let problemId: string | null = null;
  if (input.kind === 'disease' || input.kind === 'pest') {
    if (!input.problemCode) throw validation({ problemCode: ['required'] });
    if (!input.severity) throw validation({ severity: ['required'] });
    const [p] = await tx.select({ id: problem.id, code: problem.code }).from(problem).where(eq(problem.code, input.problemCode)).limit(1);
    if (!p) throw validation({ problemCode: ['unknownProblem'] });
    if (p.code === 'other' && !input.problemOther) throw validation({ problemOther: ['required'] });
    problemId = p.id;
  }
  if (input.kind === 'intervention' && !input.intervention) throw validation({ intervention: ['required'] });
  if (input.kind === 'note' && !input.body && input.attachmentIds.length === 0) throw validation({ body: ['required'] });
  const attachments = input.attachmentIds.length === 0 ? [] : await tx.select({ id: attachment.id }).from(attachment).where(and(
    eq(attachment.gardenId, scope.gardenId), inArray(attachment.id, input.attachmentIds), eq(attachment.uploadedBy, actor.id),
    isNull(attachment.journalEntryId), isNull(attachment.deletedAt),
  ));
  if (attachments.length !== new Set(input.attachmentIds).size) throw validation({ attachmentIds: ['attachmentInvalid'] });
  const kind = input.kind === 'note' && !input.body && attachments.length > 0 ? 'photo' : input.kind;
  const [e] = await tx.insert(journalEntry).values({
    gardenId: scope.gardenId, cultureId: input.cultureId ?? null, zoneId: input.cultureId ? null : (input.zoneId ?? null), kind, observedAt,
    body: input.body ?? null, problemId, problemOther: input.problemOther ?? null, severity: input.severity ?? null,
    intervention: input.kind === 'intervention' ? (input.intervention ?? null) : null, weather: input.weather ?? null, authorId: actor.id,
  }).returning({ id: journalEntry.id });
  if (!e) throw new Error("Insertion de l'entrée échouée");
  if (attachments.length > 0) await tx.update(attachment).set({ journalEntryId: e.id }).where(inArray(attachment.id, attachments.map((a) => a.id)));
  // JRN-05 : arroser termine les tickets d'arrosage échus de la culture, de sa zone ou d'un ancêtre.
  if (input.kind === 'intervention' && input.intervention === 'watering') {
    await completeWateringTickets(tx, scope, { cultureId: input.cultureId, zoneId: input.cultureId ? undefined : input.zoneId }, actor.id, now);
  }
  const structured = problemId !== null || input.intervention !== undefined || input.weather !== undefined;
  await emit(tx, { type: 'journal.entry_created', subjectType: 'journal_entry', subjectId: e.id, gardenId: scope.gardenId, actorId: actor.id, payload: { kind, hasPhoto: attachments.length > 0, structured, cultureId: input.cultureId ?? null } }, now);
  return { entryId: e.id };
}

/** Suppression : auteur, ou admin / owner (matrice `journal:delete`). */
export async function deleteJournalEntry(ctx: ScopedCtx, entryId: string) {
  const { tx, scope, actor, clock } = ctx;
  const [e] = await tx.select().from(journalEntry).where(and(eq(journalEntry.gardenId, scope.gardenId), eq(journalEntry.id, entryId), isNull(journalEntry.deletedAt))).limit(1);
  if (!e) throw notFound();
  if (!can(scope, 'journal:delete', { isOwn: e.authorId === actor.id })) throw forbidden();
  await tx.update(journalEntry).set({ deletedAt: clock.now() }).where(eq(journalEntry.id, e.id));
  await emit(tx, { type: 'journal.entry_deleted', subjectType: 'journal_entry', subjectId: e.id, gardenId: scope.gardenId, actorId: actor.id, payload: {} }, clock.now());
  return { entryId };
}

export async function resolveProblem(ctx: ScopedCtx, entryId: string) {
  const { tx, scope, actor } = ctx;
  const [e] = await tx.select().from(journalEntry).where(and(eq(journalEntry.gardenId, scope.gardenId), eq(journalEntry.id, entryId), isNull(journalEntry.deletedAt))).limit(1);
  if (!e) throw notFound();
  if (!can(scope, 'journal:update', { isOwn: e.authorId === actor.id }) && !can(scope, 'journal:create')) throw forbidden();
  await tx.update(journalEntry).set({ resolved: true }).where(eq(journalEntry.id, e.id));
  return { entryId };
}

/**
 * RG-JRN-03 : téléversement d'une photo « en attente ». Type vérifié par les octets d'en-tête, métadonnées
 * JPEG retirées côté serveur (en plus de la ré-encodage côté client), dimensions bornées.
 */
export async function uploadPhoto(tx: Executor, scope: Scope, userId: string, data: Uint8Array, files: FileStorage) {
  if (scope.archived || !can(scope, 'journal:create')) throw forbidden();
  if (data.byteLength > MAX_UPLOAD_BYTES) throw validation({ file: ['fileTooLarge'] });
  const mime = sniffImage(data);
  if (!mime) throw validation({ file: ['notAnImage'] });
  const clean = mime === 'image/jpeg' ? stripJpegMetadata(data) : data;
  if (mime === 'image/jpeg' && hasExif(clean)) throw validation({ file: ['metadataNotRemoved'] });
  const size = imageSize(clean, mime);
  if (!size || size.width > MAX_IMAGE_SIDE || size.height > MAX_IMAGE_SIDE) throw validation({ file: ['imageTooLarge'] });
  const ext = mime === 'image/jpeg' ? 'jpg' : mime === 'image/png' ? 'png' : 'webp';
  const [a] = await tx.insert(attachment).values({ gardenId: scope.gardenId, storageKey: `pending-${crypto.randomUUID()}.${ext}`, mime, bytes: clean.byteLength, width: size.width, height: size.height, uploadedBy: userId })
    .returning({ id: attachment.id });
  if (!a) throw new Error('Insertion de la pièce jointe échouée');
  const key = `${scope.gardenId}/${a.id}.${ext}`;
  await tx.update(attachment).set({ storageKey: key }).where(eq(attachment.id, a.id));
  await files.put(key, clean);
  return { attachmentId: a.id, width: size.width, height: size.height };
}

/** Lecture d'une pièce jointe : uniquement pour un membre actif de son jardin (AUTHZ-08). */
export async function readAttachment(tx: Executor, loadScopeFor: (gardenId: string) => Promise<Scope | null>, attachmentId: string, files: FileStorage) {
  const [a] = await tx.select().from(attachment).where(and(eq(attachment.id, attachmentId), isNull(attachment.deletedAt))).limit(1);
  if (!a) return null;
  const scope = await loadScopeFor(a.gardenId);
  if (!scope) return null;
  const data = await files.get(a.storageKey);
  return data ? { data, mime: a.mime } : null;
}
