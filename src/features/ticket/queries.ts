/** Lectures du ticketing : liste, détail, mes tâches du jour, calendrier. */
import { and, asc, eq, gte, inArray, isNull, lt, lte, ne, or, sql } from 'drizzle-orm';
import { notFound } from '@/lib/errors';
import { localDate } from '@/lib/dates';
import type { TicketStatus } from '@/lib/enums';
import type { Scope } from '@/server/authz/scope';
import type { Executor } from '@/server/db/client';
import {
  attachment, culture, garden, gardenGroup, gardenMember, species, ticket, ticketAssignee, ticketChecklistItem, ticketComment, ticketSeries, userProfile, variety, zone,
} from '@/server/db/schema';
import { addDaysIso } from '../culture/stages.pure';
import { findDescendants, findZone } from '../zone/repo';
import { compareTodayTasks, occurrencesBetween } from './rules.pure';
import type { TicketFilters } from './schema';
import { MATERIALIZE_HORIZON_DAYS, TICKET_LIST_LIMIT, factsFor } from './shared';

/* ---------- Lectures ---------- */

const listColumns = {
  id: ticket.id, gardenId: ticket.gardenId, title: ticket.title, titleKey: ticket.titleKey, titleParams: ticket.titleParams, type: ticket.type, actionTag: ticket.actionTag,
  status: ticket.status, priority: ticket.priority, dueOn: ticket.dueOn, visibleFrom: ticket.visibleFrom, level: ticket.level,
  zoneId: ticket.zoneId, cultureId: ticket.cultureId, seriesId: ticket.seriesId, createdBy: ticket.createdBy, sourceStageId: ticket.sourceStageId,
  zoneName: zone.name, cultureLabel: sql<string | null>`(select concat_ws(' ', s.common_names->'fr'->>0, v.name) from culture c join species s on s.id = c.species_id left join variety v on v.id = c.variety_id where c.id = ${ticket.cultureId})`,
};

/** Assignations et progression de checklist d'un lot de tickets (une requête chacune, pas de N+1). */
async function decorate<T extends { id: string }>(tx: Executor, rows: T[]) {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const assignees = await tx.select({ ticketId: ticketAssignee.ticketId, memberId: ticketAssignee.memberId, groupId: ticketAssignee.groupId, pseudo: userProfile.pseudo, groupName: gardenGroup.name })
    .from(ticketAssignee).leftJoin(gardenMember, eq(gardenMember.id, ticketAssignee.memberId)).leftJoin(userProfile, eq(userProfile.userId, gardenMember.userId))
    .leftJoin(gardenGroup, eq(gardenGroup.id, ticketAssignee.groupId)).where(inArray(ticketAssignee.ticketId, ids));
  const checklist = await tx.select({ ticketId: ticketChecklistItem.ticketId, total: sql<number>`count(*)::int`, done: sql<number>`count(*) filter (where ${ticketChecklistItem.done})::int` })
    .from(ticketChecklistItem).where(inArray(ticketChecklistItem.ticketId, ids)).groupBy(ticketChecklistItem.ticketId);
  return rows.map((r) => ({
    ...r,
    assignees: assignees.filter((a) => a.ticketId === r.id).map((a) => (a.memberId ? { kind: 'member' as const, id: a.memberId, label: a.pseudo ?? '' } : { kind: 'group' as const, id: a.groupId ?? '', label: a.groupName ?? '' })),
    checklist: checklist.find((c) => c.ticketId === r.id) ?? null,
  }));
}

/** RG-TCK-12 / 13 : liste filtrable (bornée). Les tickets pas encore visibles n'apparaissent qu'avec « à venir ». */
export async function listTickets(tx: Executor, scope: Scope, f: TicketFilters, today: string) {
  let zoneIds: string[] | null = null;
  if (f.zone) {
    const z = await findZone(tx, scope, f.zone);
    zoneIds = [z.id, ...(await findDescendants(tx, scope, z)).map((d) => d.id)];
  }
  const weekEnd = addDaysIso(today, 7);
  const statusCond = f.statut === 'termines' ? inArray(ticket.status, ['done', 'cancelled', 'skipped']) : f.statut === 'tous' ? undefined : inArray(ticket.status, ['todo', 'in_progress', 'blocked']);
  const dueCond = f.echeance === 'retard' ? lt(ticket.dueOn, today) : f.echeance === 'aujourdhui' ? eq(ticket.dueOn, today) : f.echeance === 'semaine' ? and(gte(ticket.dueOn, today), lte(ticket.dueOn, weekEnd))
    : f.echeance === 'sans' ? isNull(ticket.dueOn) : undefined;
  const visibleCond = f.echeance === 'avenir' ? sql`${ticket.visibleFrom} > ${today}` : or(isNull(ticket.visibleFrom), lte(ticket.visibleFrom, today));
  const assigneeCond = f.assigne === 'moi'
    ? sql`exists (select 1 from ticket_assignee ta where ta.ticket_id = ${ticket.id} and (ta.member_id = ${scope.memberId} or ta.group_id in (select gm.group_id from group_member gm where gm.member_id = ${scope.memberId})))`
    : f.assigne ? sql`exists (select 1 from ticket_assignee ta where ta.ticket_id = ${ticket.id} and ta.member_id = ${f.assigne})` : undefined;
  const groupCond = f.groupe ? sql`exists (select 1 from ticket_assignee ta where ta.ticket_id = ${ticket.id} and ta.group_id = ${f.groupe})` : undefined;
  // Un ticket de culture appartient à la zone de sa culture (TCK-03).
  const zoneCond = zoneIds ? or(inArray(ticket.zoneId, zoneIds), sql`${ticket.cultureId} in (select c.id from culture c where c.zone_id in ${zoneIds})`) : undefined;
  const rows = await tx.select(listColumns).from(ticket).leftJoin(zone, eq(zone.id, ticket.zoneId))
    .where(and(
      eq(ticket.gardenId, scope.gardenId), isNull(ticket.deletedAt), statusCond, dueCond, visibleCond, assigneeCond, groupCond, zoneCond,
      f.culture ? eq(ticket.cultureId, f.culture) : undefined, f.type ? eq(ticket.type, f.type) : undefined,
      f.niveau ? eq(ticket.level, f.niveau) : undefined, f.priorite ? eq(ticket.priority, f.priorite) : undefined,
    ))
    .orderBy(sql`${ticket.dueOn} asc nulls last`, asc(ticket.createdAt)).limit(TICKET_LIST_LIMIT);
  return decorate(tx, rows);
}

export type TicketListRow = Awaited<ReturnType<typeof listTickets>>[number];

export async function ticketDetail(tx: Executor, scope: Scope, ticketId: string) {
  const [row] = await tx.select(listColumns).from(ticket).leftJoin(zone, eq(zone.id, ticket.zoneId))
    .where(and(eq(ticket.gardenId, scope.gardenId), eq(ticket.id, ticketId), isNull(ticket.deletedAt))).limit(1);
  if (!row) throw notFound('ticketNotFound');
  const [decorated] = await decorate(tx, [row]);
  const [full] = await tx.select().from(ticket).where(eq(ticket.id, ticketId)).limit(1);
  const checklist = await tx.select().from(ticketChecklistItem).where(eq(ticketChecklistItem.ticketId, ticketId)).orderBy(asc(ticketChecklistItem.sortOrder));
  const comments = await tx.select({ id: ticketComment.id, body: ticketComment.body, createdAt: ticketComment.createdAt, authorId: ticketComment.authorId, pseudo: userProfile.pseudo })
    .from(ticketComment).leftJoin(userProfile, eq(userProfile.userId, ticketComment.authorId))
    .where(and(eq(ticketComment.ticketId, ticketId), isNull(ticketComment.deletedAt))).orderBy(asc(ticketComment.createdAt)).limit(200);
  const photos = await tx.select({ id: attachment.id, width: attachment.width, height: attachment.height }).from(attachment).where(and(eq(attachment.ticketId, ticketId), isNull(attachment.deletedAt)));
  const facts = full ? await factsFor(tx, scope, full) : { isOwn: false, isAssigned: false, isUnassigned: true };
  const [creator] = full ? await tx.select({ pseudo: userProfile.pseudo }).from(userProfile).where(eq(userProfile.userId, full.createdBy)).limit(1) : [];
  return { ...(decorated ?? { ...row, assignees: [], checklist: null }), full, checklistItems: checklist, comments, photos, facts, creatorPseudo: creator?.pseudo ?? '' };
}

export type TicketDetail = Awaited<ReturnType<typeof ticketDetail>>;

/**
 * RG-TCK-06 : mes tâches du jour, tous jardins confondus. Assignées à moi (directement ou via un groupe)
 * ou créées par moi sans assignation ; échues aujourd'hui ou avant et visibles. Triées puis groupées par jardin.
 */
export async function myTasksToday(tx: Executor, userId: string, now: Date) {
  const memberships = (await tx.select({ memberId: gardenMember.id, gardenId: gardenMember.gardenId, gardenName: garden.name, timezone: garden.timezone })
    .from(gardenMember).innerJoin(garden, eq(garden.id, gardenMember.gardenId))
    .where(and(eq(gardenMember.userId, userId), isNull(gardenMember.leftAt), isNull(garden.deletedAt), isNull(garden.archivedAt))))
    .map((m) => ({ ...m, today: localDate(now, m.timezone) }));
  if (memberships.length === 0) return [];
  // Une seule requête pour tous les jardins : « aujourd'hui » dépend du fuseau de chacun (§3.7).
  const rows = await tx.select(listColumns).from(ticket).leftJoin(zone, eq(zone.id, ticket.zoneId)).where(and(
    isNull(ticket.deletedAt), inArray(ticket.status, ['todo', 'in_progress', 'blocked']),
    or(...memberships.map((m) => and(
      eq(ticket.gardenId, m.gardenId), lte(ticket.dueOn, m.today), or(isNull(ticket.visibleFrom), lte(ticket.visibleFrom, m.today)),
      or(
        sql`exists (select 1 from ticket_assignee ta where ta.ticket_id = ${ticket.id} and (ta.member_id = ${m.memberId} or ta.group_id in (select gm.group_id from group_member gm join garden_group gg on gg.id = gm.group_id where gm.member_id = ${m.memberId} and gg.archived_at is null)))`,
        and(eq(ticket.createdBy, userId), sql`not exists (select 1 from ticket_assignee ta where ta.ticket_id = ${ticket.id})`),
      ),
    ))),
  )).orderBy(asc(ticket.dueOn)).limit(TICKET_LIST_LIMIT * memberships.length);
  const decorated = await decorate(tx, rows);
  return memberships.flatMap((m) => {
    const tasks = decorated.filter((r) => r.gardenId === m.gardenId).sort(compareTodayTasks(m.today)).slice(0, TICKET_LIST_LIMIT);
    return tasks.length ? [{ gardenId: m.gardenId, gardenName: m.gardenName, today: m.today, tasks }] : [];
  });
}

export type CalendarItem = { id: string | null; title: string; titleKey: string | null; titleParams: Record<string, string> | null; dueOn: string; status: TicketStatus; virtual: boolean };

/** Calendrier d'un mois : tickets (même pas encore visibles) + occurrences virtuelles au-delà de l'horizon (TCK-11). */
export async function calendarMonth(tx: Executor, scope: Scope, month: string, today: string): Promise<CalendarItem[]> {
  const first = `${month}-01`;
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y ?? 2026, m ?? 1, 0)).toISOString().slice(0, 10);
  const rows = await tx.select({ id: ticket.id, title: ticket.title, titleKey: ticket.titleKey, titleParams: ticket.titleParams, dueOn: ticket.dueOn, status: ticket.status })
    .from(ticket).where(and(eq(ticket.gardenId, scope.gardenId), isNull(ticket.deletedAt), gte(ticket.dueOn, first), lte(ticket.dueOn, last), ne(ticket.status, 'skipped')))
    .orderBy(asc(ticket.dueOn)).limit(500);
  const items: CalendarItem[] = rows.flatMap((r) => (r.dueOn ? [{ ...r, dueOn: r.dueOn, virtual: false }] : []));
  const horizon = addDaysIso(today, MATERIALIZE_HORIZON_DAYS);
  const series = await tx.select().from(ticketSeries).where(and(eq(ticketSeries.gardenId, scope.gardenId), isNull(ticketSeries.endedAt)));
  for (const s of series) {
    const from = horizon >= first ? addDaysIso(horizon, 1) : first;
    if (from > last) continue;
    for (const d of occurrencesBetween(s.rrule, s.dtstart, s.until, from, last)) {
      items.push({ id: null, title: s.template.title, titleKey: null, titleParams: null, dueOn: d, status: 'todo', virtual: true });
    }
  }
  return items.sort((a, b) => a.dueOn.localeCompare(b.dueOn));
}

export async function ticketsOf(tx: Executor, scope: Scope, target: { cultureId?: string; zoneId?: string }, limit = 50) {
  const rows = await tx.select(listColumns).from(ticket).leftJoin(zone, eq(zone.id, ticket.zoneId)).where(and(
    eq(ticket.gardenId, scope.gardenId), isNull(ticket.deletedAt), inArray(ticket.status, ['todo', 'in_progress', 'blocked']),
    target.cultureId ? eq(ticket.cultureId, target.cultureId) : target.zoneId ? eq(ticket.zoneId, target.zoneId) : sql`false`,
  )).orderBy(sql`${ticket.dueOn} asc nulls last`).limit(limit);
  return decorate(tx, rows);
}

/** Cultures en cours (sélecteur de rattachement d'un ticket). */
export async function runningCultures(tx: Executor, scope: Scope) {
  return tx.select({ id: culture.id, label: sql<string>`concat_ws(' ', ${species.commonNames}->'fr'->>0, ${variety.name}, '— ' || ${zone.name})` }).from(culture)
    .innerJoin(species, eq(species.id, culture.speciesId)).leftJoin(variety, eq(variety.id, culture.varietyId)).innerJoin(zone, eq(zone.id, culture.zoneId))
    .where(and(eq(culture.gardenId, scope.gardenId), isNull(culture.deletedAt), inArray(culture.status, ['planned', 'active'])))
    .orderBy(asc(zone.name)).limit(300);
}
