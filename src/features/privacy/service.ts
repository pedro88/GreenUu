import { and, asc, desc, eq, gt, inArray, isNull, lt, ne, or, sql } from 'drizzle-orm';
import { DomainError, notFound, validation } from '@/lib/errors';
import { signPayload, verifyPayload } from '@/lib/tokens';
import { zip, type ZipEntry } from '@/lib/zip';
import type { ServiceCtx } from '@/server/action-core';
import type { Executor } from '@/server/db/client';
import {
  account, attachment, consent, culture, cultureResult, dataExport, garden, gardenMember, guide, guideVersion, harvest, journalEntry, session, tip,
  tipVote, user, userProfile,
} from '@/server/db/schema';
import { env } from '@/server/env';
import { emit } from '@/server/events/emit';
import { accountDeletionMail, dataExportMail } from '@/server/mail/templates';
import type { FileStorage } from '@/server/storage/storage';

/* RGPD (SPEC §11.4) : export, suppression avec délai de grâce, rétablissement et purge. */

export const EXPORT_VALID_DAYS = 7;
export const GRACE_DAYS = 30;
const DAY = 86_400_000;
export const DELETED_PSEUDO = 'Jardinier·e supprimé·e';

/** Une demande d'export par 24 heures ; l'archive est produite par le job `privacy.export`. */
export async function requestExport(ctx: ServiceCtx) {
  const { tx, actor, clock, jobs } = ctx;
  const [last] = await tx.select({ createdAt: dataExport.createdAt }).from(dataExport).where(eq(dataExport.userId, actor.id)).orderBy(desc(dataExport.createdAt)).limit(1);
  if (last && clock.now().getTime() - last.createdAt.getTime() < DAY) throw new DomainError('RATE_LIMITED', 'exportOncePerDay');
  const [e] = await tx.insert(dataExport).values({ userId: actor.id, createdAt: clock.now() }).returning({ id: dataExport.id });
  if (!e) throw new Error("Création de l'export échouée");
  await jobs.enqueue('privacy.export', { exportId: e.id });
  await emit(tx, { type: 'privacy.export_requested', subjectType: 'user', subjectId: actor.id, gardenId: null, actorId: actor.id, payload: {} }, clock.now());
  return { exportId: e.id };
}

const json = (v: unknown) => new TextEncoder().encode(JSON.stringify(v, null, 2));

/**
 * Contenu de l'archive : profil, adhésions, contenus rédigés, cultures, journal, récoltes et bilans des jardins dont
 * l'utilisateur est owner ou dont il est l'auteur, journal d'XP (lot 6), consentements et photos téléversées.
 */
export async function exportEntries(tx: Executor, userId: string, files: FileStorage): Promise<ZipEntry[]> {
  const [u] = await tx.select({ email: user.email, name: user.name, createdAt: user.createdAt }).from(user).where(eq(user.id, userId)).limit(1);
  const [profile] = await tx.select().from(userProfile).where(eq(userProfile.userId, userId)).limit(1);
  const memberships = await tx.select({ gardenId: gardenMember.gardenId, garden: garden.name, role: gardenMember.role, joinedAt: gardenMember.joinedAt, leftAt: gardenMember.leftAt })
    .from(gardenMember).innerJoin(garden, eq(garden.id, gardenMember.gardenId)).where(eq(gardenMember.userId, userId));
  const owned = memberships.filter((m) => m.role === 'owner' && m.leftAt === null).map((m) => m.gardenId);
  const mine = (authorCol: typeof culture.createdBy, gardenCol: typeof culture.gardenId) => (owned.length ? or(eq(authorCol, userId), inArray(gardenCol, owned)) : eq(authorCol, userId));
  const cultures = await tx.select().from(culture).where(mine(culture.createdBy, culture.gardenId));
  const journal = await tx.select().from(journalEntry).where(owned.length ? or(eq(journalEntry.authorId, userId), inArray(journalEntry.gardenId, owned)) : eq(journalEntry.authorId, userId));
  const harvests = await tx.select().from(harvest).where(owned.length ? or(eq(harvest.authorId, userId), inArray(harvest.gardenId, owned)) : eq(harvest.authorId, userId));
  const results = await tx.select().from(cultureResult).where(owned.length ? or(eq(cultureResult.authorId, userId), inArray(cultureResult.gardenId, owned)) : eq(cultureResult.authorId, userId));
  const guides = await tx.select({ id: guide.id, visibility: guide.visibility, draft: guide.draft }).from(guide).where(eq(guide.authorId, userId));
  const versions = guides.length ? await tx.select().from(guideVersion).where(inArray(guideVersion.guideId, guides.map((g) => g.id))) : [];
  const tips = await tx.select({ id: tip.id, body: tip.body, createdAt: tip.createdAt }).from(tip).where(eq(tip.authorId, userId));
  const consents = await tx.select({ kind: consent.kind, version: consent.version, gardenId: consent.gardenId, grantedAt: consent.grantedAt, revokedAt: consent.revokedAt }).from(consent).where(eq(consent.userId, userId));
  const photos = await tx.select({ id: attachment.id, key: attachment.storageKey, mime: attachment.mime }).from(attachment).where(and(eq(attachment.uploadedBy, userId), isNull(attachment.deletedAt)));
  const entries: ZipEntry[] = [
    { name: 'profil.json', data: json({ ...u, profile }) },
    { name: 'adhesions.json', data: json(memberships) },
    { name: 'cultures.json', data: json(cultures) },
    { name: 'journal.json', data: json(journal) },
    { name: 'recoltes.json', data: json(harvests) },
    { name: 'bilans.json', data: json(results) },
    { name: 'guides.json', data: json({ guides, versions }) },
    { name: 'tips.json', data: json(tips) },
    // Le journal d'XP arrive au lot 6 : la clé est présente dès maintenant pour un format d'archive stable.
    { name: 'xp.json', data: json([]) },
    { name: 'consentements.json', data: json(consents) },
  ];
  for (const p of photos) {
    const data = await files.get(p.key);
    if (data) entries.push({ name: `photos/${p.id}.${p.mime === 'image/png' ? 'png' : p.mime === 'image/webp' ? 'webp' : 'jpg'}`, data });
  }
  return entries;
}

/** Job `privacy.export` : archive stockée, valable 7 jours, lien envoyé par e-mail. */
export async function buildExport(ctx: Omit<ServiceCtx, 'actor'>, exportId: string, files: FileStorage) {
  const { tx, clock, jobs, appUrl } = ctx;
  const [e] = await tx.select().from(dataExport).where(eq(dataExport.id, exportId)).limit(1);
  if (!e || e.status !== 'pending') return;
  const archive = zip(await exportEntries(tx, e.userId, files));
  const key = `exports/${e.userId}/${e.id}.zip`;
  await files.put(key, archive);
  const now = clock.now();
  await tx.update(dataExport).set({ status: 'ready', storageKey: key, bytes: archive.length, readyAt: now, expiresAt: new Date(now.getTime() + EXPORT_VALID_DAYS * DAY) }).where(eq(dataExport.id, e.id));
  const [u] = await tx.select({ email: user.email }).from(user).where(eq(user.id, e.userId)).limit(1);
  if (u) await jobs.enqueue('mail.send', dataExportMail({ to: u.email, url: `${appUrl}/app/parametres/confidentialite/export/${e.id}` }));
}

/** Efface les archives d'un ensemble d'exports (fichier puis ligne marquée `expired`) : rien ne survit à l'échéance. */
async function eraseExports(tx: Executor, files: FileStorage, rows: { id: string; storageKey: string | null }[]) {
  for (const r of rows) if (r.storageKey) await files.remove(r.storageKey);
  if (rows.length) await tx.update(dataExport).set({ status: 'expired', storageKey: null }).where(inArray(dataExport.id, rows.map((r) => r.id)));
}

/** Job `privacy.purge` : les archives expirées (7 jours) sont effacées du stockage (§11.4, audit lot 5 M1). */
export async function purgeExpiredExports(tx: Executor, files: FileStorage, now: Date) {
  const rows = await tx.select({ id: dataExport.id, storageKey: dataExport.storageKey }).from(dataExport).where(and(eq(dataExport.status, 'ready'), lt(dataExport.expiresAt, now)));
  await eraseExports(tx, files, rows);
  return rows.length;
}

/** Téléchargement : l'utilisateur lui-même, connecté, avant expiration (§11.4). */
export async function readExport(tx: Executor, userId: string, exportId: string, files: FileStorage, now: Date) {
  const [e] = await tx.select().from(dataExport).where(and(eq(dataExport.id, exportId), eq(dataExport.userId, userId), eq(dataExport.status, 'ready'), gt(dataExport.expiresAt, now))).limit(1);
  if (!e?.storageKey) throw notFound();
  const data = await files.get(e.storageKey);
  if (!data) throw notFound();
  return data;
}

const restoreToken = (userId: string, requestedAt: Date) => signPayload(`restore:${userId}:${requestedAt.getTime()}`, env().BETTER_AUTH_SECRET);

/**
 * Suppression demandée (§11.4 point 2) : compte désactivé tout de suite (sessions révoquées, connexion refusée),
 * délai de grâce de 30 jours, lien de rétablissement par e-mail. Les jardins ne sont touchés qu'à la purge, pour que
 * le rétablissement rende le compte « à l'identique » (PRV-09). Un jardin sans admin mais avec des membres exige la
 * confirmation explicite du transfert au membre le plus ancien.
 */
export async function requestDeletion(ctx: ServiceCtx, opts: { confirmTransferToMember: boolean }) {
  const { tx, actor, clock, jobs, appUrl } = ctx;
  const plan = await ownershipPlan(tx, actor.id);
  if (plan.some((p) => p.to?.role === 'member') && !opts.confirmTransferToMember) throw validation({ confirmTransferToMember: ['confirmTransferToMember'] });
  const now = clock.now();
  await tx.update(userProfile).set({ deletionRequestedAt: now }).where(eq(userProfile.userId, actor.id));
  await tx.delete(session).where(eq(session.userId, actor.id));
  const purgeOn = new Date(now.getTime() + GRACE_DAYS * DAY).toISOString().slice(0, 10);
  await jobs.enqueue('mail.send', accountDeletionMail({ to: actor.email, purgeOn, url: `${appUrl}/retablissement/${restoreToken(actor.id, now)}` }));
  await emit(tx, { type: 'privacy.deletion_requested', subjectType: 'user', subjectId: actor.id, gardenId: null, actorId: actor.id, payload: { purgeOn } }, now);
  return { purgeOn };
}

/** PRV-09 : le lien rétablit le compte dans les 30 jours ; un lien d'une demande annulée ou ancienne est refusé. */
export async function restoreAccount(tx: Executor, token: string, now: Date) {
  const [kind, userId, ts] = verifyPayload(token, env().BETTER_AUTH_SECRET)?.split(':') ?? [];
  if (kind !== 'restore' || !userId || !ts) throw notFound('restoreInvalid');
  const [p] = await tx.select({ requestedAt: userProfile.deletionRequestedAt }).from(userProfile).where(eq(userProfile.userId, userId)).limit(1);
  if (!p?.requestedAt || p.requestedAt.getTime() !== Number(ts) || now.getTime() - p.requestedAt.getTime() > GRACE_DAYS * DAY) throw notFound('restoreInvalid');
  await tx.update(userProfile).set({ deletionRequestedAt: null }).where(eq(userProfile.userId, userId));
  await emit(tx, { type: 'privacy.deletion_cancelled', subjectType: 'user', subjectId: userId, gardenId: null, actorId: userId, payload: {} }, now);
  return { userId };
}

/** Pour chaque jardin possédé : héritier (admin le plus ancien, sinon membre le plus ancien), ou aucun (jardin supprimé). */
async function ownershipPlan(tx: Executor, userId: string) {
  const owned = await tx.select({ gardenId: gardenMember.gardenId, memberId: gardenMember.id }).from(gardenMember)
    .where(and(eq(gardenMember.userId, userId), eq(gardenMember.role, 'owner'), isNull(gardenMember.leftAt)));
  const plan: { gardenId: string; ownerMemberId: string; to: { memberId: string; userId: string; role: string } | null }[] = [];
  for (const o of owned) {
    const [heir] = await tx.select({ memberId: gardenMember.id, userId: gardenMember.userId, role: gardenMember.role }).from(gardenMember)
      .where(and(eq(gardenMember.gardenId, o.gardenId), ne(gardenMember.userId, userId), isNull(gardenMember.leftAt), inArray(gardenMember.role, ['admin', 'member'])))
      .orderBy(sql`case when ${gardenMember.role} = 'admin' then 0 else 1 end`, asc(gardenMember.joinedAt)).limit(1);
    plan.push({ gardenId: o.gardenId, ownerMemberId: o.memberId, to: heir ?? null });
  }
  return plan;
}

/**
 * Job `privacy.purge` (J+30, §11.4 point 3) : propriété transférée (PRV-08), jardins sans autre membre supprimés,
 * identité effacée, photos, tips et votes supprimés, guides retirés ; les contributions aux jardins partagés restent,
 * signées « Jardinier·e supprimé·e ».
 */
export async function purgeDeletedAccounts(tx: Executor, files: FileStorage, now: Date) {
  const due = await tx.select({ userId: userProfile.userId }).from(userProfile).where(lt(userProfile.deletionRequestedAt, new Date(now.getTime() - GRACE_DAYS * DAY)));
  for (const { userId } of due) {
    for (const p of await ownershipPlan(tx, userId)) {
      if (p.to) {
        await tx.update(gardenMember).set({ role: 'admin', leftAt: now }).where(eq(gardenMember.id, p.ownerMemberId));
        await tx.update(gardenMember).set({ role: 'owner' }).where(eq(gardenMember.id, p.to.memberId));
        await emit(tx, { type: 'garden.ownership_transferred', subjectType: 'garden', subjectId: p.gardenId, gardenId: p.gardenId, actorId: null, payload: { fromUserId: userId, toUserId: p.to.userId } }, now);
      } else {
        await tx.update(garden).set({ deletedAt: now }).where(eq(garden.id, p.gardenId));
      }
    }
    await tx.update(gardenMember).set({ leftAt: now }).where(and(eq(gardenMember.userId, userId), isNull(gardenMember.leftAt)));
    const photos = await tx.select({ id: attachment.id, key: attachment.storageKey }).from(attachment).where(eq(attachment.uploadedBy, userId));
    for (const ph of photos) await files.remove(ph.key);
    if (photos.length) await tx.update(attachment).set({ deletedAt: now }).where(inArray(attachment.id, photos.map((ph) => ph.id)));
    await eraseExports(tx, files, await tx.select({ id: dataExport.id, storageKey: dataExport.storageKey }).from(dataExport).where(eq(dataExport.userId, userId)));
    await tx.delete(tipVote).where(eq(tipVote.userId, userId));
    await tx.update(tip).set({ deletedAt: now }).where(eq(tip.authorId, userId));
    await tx.update(guide).set({ deletedAt: now }).where(and(eq(guide.authorId, userId), isNull(guide.deletedAt)));
    const tag = userId.replace(/-/g, '').slice(0, 8);
    await tx.update(userProfile).set({ pseudo: `${DELETED_PSEUDO} ${tag}`, deletionRequestedAt: null, profileVisibility: 'private' }).where(eq(userProfile.userId, userId));
    await tx.update(user).set({ email: `supprime-${tag}@greenu.invalid`, name: DELETED_PSEUDO, emailVerified: false }).where(eq(user.id, userId));
    await tx.delete(account).where(eq(account.userId, userId));
    await tx.delete(session).where(eq(session.userId, userId));
    await emit(tx, { type: 'privacy.purged', subjectType: 'user', subjectId: userId, gardenId: null, actorId: null, payload: {} }, now);
  }
  return due.length;
}

/** Un compte en suppression est désactivé : aucune session ne doit le servir (défense en profondeur). */
export async function isDeactivated(tx: Executor, userId: string) {
  const [p] = await tx.select({ at: userProfile.deletionRequestedAt }).from(userProfile).where(eq(userProfile.userId, userId)).limit(1);
  return p?.at != null;
}


/** Dernier export prêt et encore valable, pour la page de confidentialité. */
export async function latestExport(tx: Executor, userId: string, now: Date) {
  const [e] = await tx.select({ id: dataExport.id, expiresAt: dataExport.expiresAt }).from(dataExport)
    .where(and(eq(dataExport.userId, userId), eq(dataExport.status, 'ready'), gt(dataExport.expiresAt, now))).orderBy(desc(dataExport.createdAt)).limit(1);
  return e?.expiresAt ? { id: e.id, expiresAt: e.expiresAt } : null;
}
