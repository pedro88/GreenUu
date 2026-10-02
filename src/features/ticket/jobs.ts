import { and, eq, gte, inArray, isNull, lt, sql } from 'drizzle-orm';
import { localDate } from '@/lib/dates';
import { TZDate } from '@date-fns/tz';
import type { Executor } from '@/server/db/client';
import { garden, gardenMember, groupMember, notification, notificationPreference, ticket, ticketAssignee, ticketSeries, user, userProfile } from '@/server/db/schema';
import type { JobQueue } from '@/server/jobs/queues';
import { addDaysIso } from '../culture/stages.pure';
import { notify } from '../notification/service';
import { materializeSeries } from './generated';
import { myTasksToday } from './queries';

/** Job horaire : matérialisation des occurrences et occurrences manquées (RG-TCK-07, 08). */
export async function materializeAllSeries(db: { transaction: <T>(fn: (tx: Executor) => Promise<T>) => Promise<T> } & Executor, now: Date) {
  const series = await db.select({ s: ticketSeries, tz: garden.timezone }).from(ticketSeries).innerJoin(garden, eq(garden.id, ticketSeries.gardenId))
    .where(and(isNull(ticketSeries.endedAt), isNull(garden.archivedAt), isNull(garden.deletedAt)));
  let created = 0;
  for (const { s, tz } of series) created += (await db.transaction((tx) => materializeSeries(tx, s, localDate(now, tz)))).length;
  return created;
}

const localHour = (now: Date, tz: string) => new TZDate(now, tz).getHours();

/** Utilisateurs à prévenir pour un ticket : assignés (directs et via groupes), sinon son créateur. */
async function recipientsOf(tx: Executor, ticketId: string, createdBy: string) {
  const rows = await tx.select({ memberId: ticketAssignee.memberId, groupId: ticketAssignee.groupId }).from(ticketAssignee).where(eq(ticketAssignee.ticketId, ticketId));
  if (rows.length === 0) return [createdBy];
  const memberIds = rows.flatMap((r) => (r.memberId ? [r.memberId] : []));
  const groupIds = rows.flatMap((r) => (r.groupId ? [r.groupId] : []));
  const direct = memberIds.length ? await tx.select({ u: gardenMember.userId }).from(gardenMember).where(and(inArray(gardenMember.id, memberIds), isNull(gardenMember.leftAt))) : [];
  const viaGroups = groupIds.length ? await tx.select({ u: gardenMember.userId }).from(groupMember).innerJoin(gardenMember, eq(gardenMember.id, groupMember.memberId))
    .where(and(inArray(groupMember.groupId, groupIds), isNull(gardenMember.leftAt))) : [];
  return [...new Set([...direct, ...viaGroups].map((r) => r.u))];
}

/**
 * Toutes les 15 min (RG-NTF-01) : `due_soon` la veille de l'échéance à partir de 8 h (heure du jardin),
 * `overdue` une seule fois. Les occurrences récurrentes « à sauter » n'ont pas d'alerte de retard (RCR-03).
 */
export async function dueReminders(tx: Executor, jobs: JobQueue, appUrl: string, now: Date) {
  const gardens = await tx.select({ id: garden.id, tz: garden.timezone }).from(garden).where(and(isNull(garden.archivedAt), isNull(garden.deletedAt)));
  let sent = 0;
  for (const g of gardens) {
    const today = localDate(now, g.tz);
    if (localHour(now, g.tz) >= 8) {
      const soon = await tx.select().from(ticket).where(and(
        eq(ticket.gardenId, g.id), isNull(ticket.deletedAt), inArray(ticket.status, ['todo', 'in_progress', 'blocked']),
        eq(ticket.dueOn, addDaysIso(today, 1)), isNull(ticket.dueSoonNotifiedAt),
      ));
      for (const t of soon) {
        sent += await notify(tx, jobs, appUrl, { userIds: await recipientsOf(tx, t.id, t.createdBy), type: 'due_soon', gardenId: g.id, groupKey: t.id, actorId: null, now, payload: { title: t.title, url: `/app/jardins/${g.id}/tickets/${t.id}` } });
        await tx.update(ticket).set({ dueSoonNotifiedAt: now }).where(eq(ticket.id, t.id));
      }
    }
    const late = await tx.select().from(ticket).where(and(
      eq(ticket.gardenId, g.id), isNull(ticket.deletedAt), inArray(ticket.status, ['todo', 'in_progress', 'blocked']),
      lt(ticket.dueOn, today), isNull(ticket.overdueNotifiedAt),
      sql`not exists (select 1 from ticket_series s where s.id = ${ticket.seriesId} and s.skip_missed)`,
    ));
    for (const t of late) {
      sent += await notify(tx, jobs, appUrl, { userIds: await recipientsOf(tx, t.id, t.createdBy), type: 'overdue', gardenId: g.id, groupKey: t.id, actorId: null, now, payload: { title: t.title, url: `/app/jardins/${g.id}/tickets/${t.id}` } });
      await tx.update(ticket).set({ overdueNotifiedAt: now }).where(eq(ticket.id, t.id));
    }
  }
  return sent;
}

/** Récapitulatif quotidien à 7 h (fuseau de l'utilisateur), pour qui l'a activé par e-mail. */
export async function dailyDigest(tx: Executor, jobs: JobQueue, appUrl: string, now: Date) {
  const subscribers = await tx.select({ id: user.id, tz: userProfile.timezone }).from(notificationPreference)
    .innerJoin(user, eq(user.id, notificationPreference.userId)).innerJoin(userProfile, eq(userProfile.userId, user.id))
    .where(and(eq(notificationPreference.type, 'digest'), eq(notificationPreference.channel, 'email'), eq(notificationPreference.enabled, true)));
  let sent = 0;
  for (const s of subscribers) {
    if (localHour(now, s.tz) !== 7) continue;
    const day = localDate(now, s.tz);
    const [already] = await tx.select({ id: notification.id }).from(notification)
      .where(and(eq(notification.userId, s.id), eq(notification.type, 'digest'), eq(notification.groupKey, day), gte(notification.createdAt, new Date(now.getTime() - 86_400_000)))).limit(1);
    if (already) continue;
    const groups = await myTasksToday(tx, s.id, now);
    const count = groups.reduce((n, g) => n + g.tasks.length, 0);
    if (count === 0) continue;
    sent += await notify(tx, jobs, appUrl, {
      userIds: [s.id], type: 'digest', gardenId: null, groupKey: day, actorId: null, now,
      payload: { title: `${count} tâche(s) aujourd'hui`, url: '/app/taches', excerpt: groups.flatMap((g) => g.tasks.map((t) => `${g.gardenName} — ${t.title}`)).slice(0, 10).join('\n') },
    });
  }
  return sent;
}
