import { and, desc, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm';
import { signPayload, verifyPayload } from '@/lib/tokens';
import { NOTIFICATION_TYPES, type NotificationChannel, type NotificationType } from '@/lib/enums';
import type { Executor } from '@/server/db/client';
import { garden, notification, notificationPreference, user } from '@/server/db/schema';
import { env } from '@/server/env';
import type { JobQueue } from '@/server/jobs/queues';
import { notificationMail } from '@/server/mail/templates';
import { effectivePreference, GROUP_WINDOW_MS } from './prefs.pure';

export type NotifyInput = {
  userIds: string[];
  type: NotificationType;
  gardenId: string | null;
  /** Clé de regroupement : par exemple l'ID du ticket (RG-NTF-03). */
  groupKey: string;
  payload: { title: string; url: string; actorName?: string; excerpt?: string };
  actorId: string | null;
  now: Date;
};

/** Préférences stockées d'un ensemble d'utilisateurs pour un type donné. */
async function storedPrefs(tx: Executor, userIds: string[], type: NotificationType) {
  if (userIds.length === 0) return new Map<string, Partial<Record<NotificationChannel, boolean>>>();
  const rows = await tx.select().from(notificationPreference).where(and(inArray(notificationPreference.userId, userIds), eq(notificationPreference.type, type)));
  const map = new Map<string, Partial<Record<NotificationChannel, boolean>>>();
  for (const r of rows) map.set(r.userId, { ...(map.get(r.userId) ?? {}), [r.channel]: r.enabled });
  return map;
}

export function unsubscribeUrl(appUrl: string, userId: string, type: NotificationType): string {
  return `${appUrl}/desinscription/${signPayload(`${userId}:${type}`, env().BETTER_AUTH_SECRET)}`;
}

/** RG-NTF-04 : destinataire et type d'un lien de désinscription, ou null si le jeton n'est pas valide. */
export function unsubscribeTarget(token: string): { userId: string; type: NotificationType } | null {
  const [userId, type] = verifyPayload(token, env().BETTER_AUTH_SECRET)?.split(':') ?? [];
  const known = NOTIFICATION_TYPES.find((x) => x === type);
  return userId && known ? { userId, type: known } : null;
}

/**
 * Notifie des utilisateurs (RG-NTF-01 à 04) : jamais l'acteur lui-même, in-app et / ou e-mail selon
 * les préférences, regroupement des notifications identiques sur 10 minutes, lien de désinscription.
 */
export async function notify(tx: Executor, jobs: JobQueue, appUrl: string, input: NotifyInput): Promise<number> {
  const recipients = [...new Set(input.userIds)].filter((id) => id !== input.actorId);
  if (recipients.length === 0) return 0;
  const prefs = await storedPrefs(tx, recipients, input.type);
  const users = await tx.select({ id: user.id, email: user.email }).from(user).where(inArray(user.id, recipients));
  const emailOf = new Map(users.map((u) => [u.id, u.email]));
  const [g] = input.gardenId ? await tx.select({ name: garden.name }).from(garden).where(eq(garden.id, input.gardenId)).limit(1) : [];
  const wanted = recipients.flatMap((userId) => {
    const p = prefs.get(userId) ?? {};
    const inApp = effectivePreference(input.type, 'in_app', p.in_app);
    const email = effectivePreference(input.type, 'email', p.email);
    return inApp || email ? [{ userId, inApp, email }] : [];
  });
  if (wanted.length === 0) return 0;
  // Regroupement (RG-NTF-03) : la notification non lue la plus récente de chaque destinataire, en une requête.
  const since = new Date(input.now.getTime() - GROUP_WINDOW_MS);
  const recent = await tx.selectDistinctOn([notification.userId], { id: notification.id, userId: notification.userId }).from(notification).where(and(
    inArray(notification.userId, wanted.map((w) => w.userId)), eq(notification.type, input.type), eq(notification.groupKey, input.groupKey),
    gt(notification.createdAt, since), isNull(notification.readAt),
  )).orderBy(notification.userId, desc(notification.createdAt));
  const grouped = new Set(recent.map((r) => r.userId));
  // On incrémente, sans nouvel e-mail dans la fenêtre.
  if (recent.length) await tx.update(notification).set({ count: sql`${notification.count} + 1`, payload: input.payload }).where(inArray(notification.id, recent.map((r) => r.id)));
  const fresh = wanted.filter((w) => !grouped.has(w.userId));
  const inserted = fresh.length === 0 ? [] : await tx.insert(notification).values(fresh.map((w) => ({
    userId: w.userId, gardenId: input.gardenId, type: input.type, groupKey: input.groupKey, payload: input.payload,
    readAt: w.inApp ? null : input.now, emailedAt: w.email && emailOf.get(w.userId) ? input.now : null, createdAt: input.now,
  }))).returning({ userId: notification.userId });
  const created = new Set(inserted.map((n) => n.userId));
  for (const w of fresh) {
    const to = emailOf.get(w.userId);
    if (!created.has(w.userId) || !w.email || !to) continue;
    await jobs.enqueue('mail.send', notificationMail({
      to, type: input.type, gardenName: g?.name ?? '', title: input.payload.title, actorName: input.payload.actorName ?? '', excerpt: input.payload.excerpt ?? '',
      url: `${appUrl}${input.payload.url}`, unsubscribeUrl: unsubscribeUrl(appUrl, w.userId, input.type),
    }));
  }
  return wanted.length;
}

export async function setPreference(tx: Executor, userId: string, type: NotificationType, channel: NotificationChannel, enabled: boolean) {
  await tx.insert(notificationPreference).values({ userId, type, channel, enabled })
    .onConflictDoUpdate({ target: [notificationPreference.userId, notificationPreference.type, notificationPreference.channel], set: { enabled } });
}

export async function listPreferences(tx: Executor, userId: string) {
  return tx.select().from(notificationPreference).where(eq(notificationPreference.userId, userId));
}

export async function listNotifications(tx: Executor, userId: string, limit = 50) {
  // or() parenthèse la condition : sans lui, le « or » s'appliquerait à tout le where (notifications d'autrui).
  return tx.select().from(notification).where(and(eq(notification.userId, userId), or(isNull(notification.readAt), sql`${notification.createdAt} > now() - interval '90 days'`)))
    .orderBy(desc(notification.createdAt)).limit(limit);
}

export async function unreadCount(tx: Executor, userId: string): Promise<number> {
  const [r] = await tx.select({ n: sql<number>`count(*)::int` }).from(notification).where(and(eq(notification.userId, userId), isNull(notification.readAt)));
  return r?.n ?? 0;
}

export async function markAllRead(tx: Executor, userId: string, now: Date) {
  await tx.update(notification).set({ readAt: now }).where(and(eq(notification.userId, userId), isNull(notification.readAt)));
}

export async function markRead(tx: Executor, userId: string, notificationId: string, now: Date) {
  await tx.update(notification).set({ readAt: now }).where(and(eq(notification.userId, userId), eq(notification.id, notificationId), isNull(notification.readAt)));
}
