import { and, asc, eq, gte, inArray, isNull, lt, lte, ne, or, sql } from 'drizzle-orm';
import { forbidden, notFound, validation } from '@/lib/errors';
import { localDate } from '@/lib/dates';
import type { Stage, TicketStatus } from '@/lib/enums';
import type { ScopedCtx } from '@/server/action-core';
import { can, type Scope } from '@/server/authz/scope';
import type { Executor } from '@/server/db/client';
import {
  attachment, culture, cultureStage, garden, gardenGroup, gardenMember, groupMember, species, ticket, ticketAssignee, ticketChecklistItem,
  ticketComment, ticketEvent, ticketSeries, userProfile, variety, zone,
} from '@/server/db/schema';
import { emit } from '@/server/events/emit';
import type { JobQueue } from '@/server/jobs/queues';
import { claimAttachments } from '../journal/attachments';
import { notify } from '../notification/service';
import { addDaysIso } from '../culture/stages.pure';
import { findDescendants, findZone } from '../zone/repo';
import { assertZoneContribute } from '../zone/service';
import { canTransition, compareTodayTasks, isOpen, occurrencesBetween, parseMentions, STAGE_TICKET_LEAD_DAYS } from './rules.pure';
import type { TicketCreateInput, TicketFilters, TicketUpdateInput } from './schema';

export const MATERIALIZE_HORIZON_DAYS = 14;
export const TICKET_LIST_LIMIT = 200;

async function gardenTz(tx: Executor, gardenId: string) {
  const [g] = await tx.select({ timezone: garden.timezone }).from(garden).where(eq(garden.id, gardenId)).limit(1);
  return g?.timezone ?? 'Europe/Paris';
}
export async function gardenToday(tx: Executor, gardenId: string, now: Date) {
  return localDate(now, await gardenTz(tx, gardenId));
}

/** Zone concernée par le rattachement (pour les restrictions de zone), en validant la cible dans le jardin. */
async function targetZoneId(tx: Executor, scope: Scope, t: { zoneId?: string | null | undefined; cultureId?: string | null | undefined }): Promise<string | null> {
  if (t.zoneId && t.cultureId) throw validation({ zoneId: ['oneTarget'] });
  if (t.cultureId) {
    const [c] = await tx.select({ zoneId: culture.zoneId }).from(culture)
      .where(and(eq(culture.gardenId, scope.gardenId), eq(culture.id, t.cultureId), isNull(culture.deletedAt))).limit(1);
    if (!c) throw notFound('cultureNotFound');
    return c.zoneId;
  }
  if (t.zoneId) return (await findZone(tx, scope, t.zoneId)).id;
  return null;
}

/** Cibles d'assignation valides : membres actifs non observateurs, groupes actifs (RG-TCK-04). */
async function assertAssignees(tx: Executor, scope: Scope, memberIds: string[], groupIds: string[]) {
  const m = [...new Set(memberIds)];
  const g = [...new Set(groupIds)];
  if (m.length) {
    const rows = await tx.select({ id: gardenMember.id }).from(gardenMember)
      .where(and(eq(gardenMember.gardenId, scope.gardenId), inArray(gardenMember.id, m), isNull(gardenMember.leftAt), ne(gardenMember.role, 'observer')));
    if (rows.length !== m.length) throw validation({ memberIds: ['assigneeInvalid'] });
  }
  if (g.length) {
    const rows = await tx.select({ id: gardenGroup.id }).from(gardenGroup)
      .where(and(eq(gardenGroup.gardenId, scope.gardenId), inArray(gardenGroup.id, g), isNull(gardenGroup.archivedAt)));
    if (rows.length !== g.length) throw validation({ groupIds: ['groupNotFound'] });
  }
  return { memberIds: m, groupIds: g };
}

/** Utilisateurs couverts par des assignations (membres directs + membres actifs des groupes). */
async function usersOf(tx: Executor, memberIds: string[], groupIds: string[]): Promise<string[]> {
  const direct = memberIds.length ? await tx.select({ u: gardenMember.userId }).from(gardenMember).where(and(inArray(gardenMember.id, memberIds), isNull(gardenMember.leftAt))) : [];
  const viaGroups = groupIds.length ? await tx.select({ u: gardenMember.userId }).from(groupMember).innerJoin(gardenMember, eq(gardenMember.id, groupMember.memberId))
    .where(and(inArray(groupMember.groupId, groupIds), isNull(gardenMember.leftAt))) : [];
  return [...new Set([...direct, ...viaGroups].map((r) => r.u))];
}

async function assigneesOf(tx: Executor, ticketId: string) {
  const rows = await tx.select({ memberId: ticketAssignee.memberId, groupId: ticketAssignee.groupId }).from(ticketAssignee).where(eq(ticketAssignee.ticketId, ticketId));
  return { memberIds: rows.flatMap((r) => (r.memberId ? [r.memberId] : [])), groupIds: rows.flatMap((r) => (r.groupId ? [r.groupId] : [])) };
}

async function actorName(tx: Executor, userId: string) {
  const [p] = await tx.select({ pseudo: userProfile.pseudo }).from(userProfile).where(eq(userProfile.userId, userId)).limit(1);
  return p?.pseudo ?? '';
}

const ticketUrl = (gardenId: string, id: string) => `/app/jardins/${gardenId}/tickets/${id}`;

async function notifyAssigned(ctx: { tx: Executor; jobs: JobQueue; appUrl: string; clock: { now(): Date }; actor: { id: string } }, scope: Scope, t: { id: string; title: string }, memberIds: string[], groupIds: string[]) {
  const users = await usersOf(ctx.tx, memberIds, groupIds);
  await notify(ctx.tx, ctx.jobs, ctx.appUrl, {
    userIds: users, type: 'assigned', gardenId: scope.gardenId, groupKey: t.id, actorId: ctx.actor.id, now: ctx.clock.now(),
    payload: { title: t.title, url: ticketUrl(scope.gardenId, t.id), actorName: await actorName(ctx.tx, ctx.actor.id) },
  });
}

async function insertTicket(tx: Executor, values: typeof ticket.$inferInsert, checklist: string[], memberIds: string[], groupIds: string[]) {
  const [t] = await tx.insert(ticket).values(values).onConflictDoNothing().returning({ id: ticket.id, title: ticket.title });
  if (!t) return null;
  if (checklist.length) await tx.insert(ticketChecklistItem).values(checklist.map((label, sortOrder) => ({ ticketId: t.id, label, sortOrder })));
  const assignees = [...memberIds.map((memberId) => ({ gardenId: values.gardenId, ticketId: t.id, memberId })), ...groupIds.map((groupId) => ({ gardenId: values.gardenId, ticketId: t.id, groupId }))];
  if (assignees.length) await tx.insert(ticketAssignee).values(assignees);
  await tx.insert(ticketEvent).values({ ticketId: t.id, actorId: values.createdBy, kind: 'created', diff: { status: values.status ?? 'todo' } });
  return t;
}

/** RG-TCK-01, 04, 07 : création d'un ticket, ou d'une série récurrente et de ses premières occurrences. */
export async function createTicket(ctx: ScopedCtx, input: Omit<TicketCreateInput, 'attachmentIds'> & { attachmentIds?: string[] }) {
  const { tx, scope, actor, clock } = ctx;
  if (scope.archived || !can(scope, 'ticket:create')) throw forbidden(scope.archived ? 'gardenArchived' : 'forbidden');
  const zoneId = await targetZoneId(tx, scope, input);
  if (zoneId) await assertZoneContribute(tx, scope, 'ticket:create', zoneId);
  const { memberIds, groupIds } = await assertAssignees(tx, scope, input.memberIds, input.groupIds);
  if (input.recurrence) {
    if (input.attachmentIds?.length) throw validation({ attachmentIds: ['attachmentsNotForSeries'] });
    const [s] = await tx.insert(ticketSeries).values({
      gardenId: scope.gardenId, zoneId: input.zoneId ?? null, cultureId: input.cultureId ?? null, rrule: input.recurrence.rrule,
      dtstart: input.recurrence.dtstart, until: input.recurrence.until ?? null, skipMissed: input.recurrence.skipMissed, createdBy: actor.id,
      template: { title: input.title, description: input.description ?? null, type: input.type, actionTag: input.actionTag ?? null, priority: input.priority, checklist: input.checklist.map((label) => ({ label })) },
      assignees: { memberIds, groupIds },
    }).returning();
    if (!s) throw new Error('Insertion de la série échouée');
    const created = await materializeSeries(tx, s, await gardenToday(tx, scope.gardenId, clock.now()));
    return { ticketId: created[0] ?? null, seriesId: s.id };
  }
  const t = await insertTicket(tx, {
    gardenId: scope.gardenId, zoneId: input.zoneId ?? null, cultureId: input.cultureId ?? null, type: input.type, actionTag: input.actionTag ?? null,
    title: input.title, description: input.description ?? null, priority: input.priority, dueOn: input.dueOn ?? null, createdBy: actor.id,
  }, input.checklist, memberIds, groupIds);
  if (!t) throw new Error('Insertion du ticket échouée');
  await claimAttachments(tx, scope, actor.id, input.attachmentIds ?? [], { ticketId: t.id });
  await emit(tx, { type: 'ticket.created', subjectType: 'ticket', subjectId: t.id, gardenId: scope.gardenId, actorId: actor.id, payload: { source: 'manual' } }, clock.now());
  await notifyAssigned(ctx, scope, t, memberIds, groupIds);
  return { ticketId: t.id, seriesId: null };
}

/**
 * RG-TCK-07 / 08 : matérialise les occurrences sur l'horizon glissant (idempotent grâce à l'unicité
 * (série, date)) puis passe en `skipped` les occurrences dépassées non terminées, sauf la plus récente.
 */
export async function materializeSeries(tx: Executor, s: typeof ticketSeries.$inferSelect, today: string): Promise<string[]> {
  if (s.endedAt) return [];
  const from = s.dtstart > addDaysIso(today, -7) ? s.dtstart : addDaysIso(today, -7);
  const to = addDaysIso(today, MATERIALIZE_HORIZON_DAYS);
  const dates = occurrencesBetween(s.rrule, s.dtstart, s.until, from, to);
  const created: string[] = [];
  for (const occurrenceOn of dates) {
    const t = await insertTicket(tx, {
      gardenId: s.gardenId, zoneId: s.zoneId, cultureId: s.cultureId, type: s.template.type, actionTag: s.template.actionTag, title: s.template.title,
      description: s.template.description, priority: s.template.priority, dueOn: occurrenceOn, visibleFrom: occurrenceOn, source: 'recurrence',
      seriesId: s.id, occurrenceOn, createdBy: s.createdBy,
    }, s.template.checklist.map((c) => c.label), s.assignees.memberIds, s.assignees.groupIds);
    if (t) created.push(t.id);
  }
  if (s.skipMissed) {
    const past = await tx.select({ id: ticket.id, status: ticket.status, occurrenceOn: ticket.occurrenceOn }).from(ticket)
      .where(and(eq(ticket.seriesId, s.id), lte(ticket.occurrenceOn, today), isNull(ticket.deletedAt), eq(ticket.detached, false)))
      .orderBy(asc(ticket.occurrenceOn));
    const latest = past[past.length - 1];
    for (const p of past) {
      if (p.id !== latest?.id && isOpen(p.status)) {
        await tx.update(ticket).set({ status: 'skipped' }).where(eq(ticket.id, p.id));
        await tx.insert(ticketEvent).values({ ticketId: p.id, actorId: null, kind: 'status', diff: { from: p.status, to: 'skipped' } });
      }
    }
  }
  return created;
}

async function loadTicket(tx: Executor, scope: Scope, ticketId: string) {
  const [t] = await tx.select().from(ticket).where(and(eq(ticket.gardenId, scope.gardenId), eq(ticket.id, ticketId), isNull(ticket.deletedAt))).limit(1);
  if (!t) throw notFound('ticketNotFound');
  return t;
}

/** Faits pour la matrice : auteur, assigné (directement ou via un groupe), sans assignation. */
async function factsFor(tx: Executor, scope: Scope, t: typeof ticket.$inferSelect) {
  const a = await assigneesOf(tx, t.id);
  const isAssigned = a.memberIds.includes(scope.memberId) || a.groupIds.some((g) => scope.groupIds.includes(g));
  return { isOwn: t.createdBy === scope.userId, isAssigned, isUnassigned: a.memberIds.length === 0 && a.groupIds.length === 0 };
}

/** Restriction de zone : un membre hors groupe autorisé ne traite que les tickets qui lui sont assignés (§5.3). */
async function assertZoneForTicket(tx: Executor, scope: Scope, t: typeof ticket.$inferSelect, isAssigned: boolean) {
  if (isAssigned) return;
  const zoneId = await targetZoneId(tx, scope, t);
  if (zoneId) await assertZoneContribute(tx, scope, 'ticket:create', zoneId);
}

export type TransitionResult = { ticketId: string; status: TicketStatus; stagePrompt: { cultureId: string; stage: Stage } | null };

/** RG-TCK-02, 03, 05 : changement de statut tracé ; `first_completed_at` conservé à la réouverture. */
export async function transitionTicket(ctx: ScopedCtx, ticketId: string, to: TicketStatus): Promise<TransitionResult> {
  const { tx, scope, actor, clock } = ctx;
  if (scope.archived) throw forbidden('gardenArchived');
  const t = await loadTicket(tx, scope, ticketId);
  const facts = await factsFor(tx, scope, t);
  if (!can(scope, 'ticket:transition', facts)) throw forbidden();
  await assertZoneForTicket(tx, scope, t, facts.isAssigned);
  if (!canTransition(t.status, to)) throw validation({ status: ['invalidTransition'] });
  const now = clock.now();
  const done = to === 'done';
  await tx.update(ticket).set({
    status: to,
    completedAt: done ? now : null,
    completedBy: done ? actor.id : null,
    ...(done && !t.firstCompletedAt ? { firstCompletedAt: now } : {}),
  }).where(eq(ticket.id, t.id));
  await tx.insert(ticketEvent).values({ ticketId: t.id, actorId: actor.id, kind: 'status', diff: { from: t.status, to } });
  if (done) await emit(tx, { type: 'ticket.completed', subjectType: 'ticket', subjectId: t.id, gardenId: scope.gardenId, actorId: actor.id, payload: { firstTime: !t.firstCompletedAt, assignedToGroup: (await assigneesOf(tx, t.id)).groupIds.length > 0, createdBy: t.createdBy } }, now);
  if (to === 'todo' && (t.status === 'done' || t.status === 'cancelled')) await emit(tx, { type: 'ticket.reopened', subjectType: 'ticket', subjectId: t.id, gardenId: scope.gardenId, actorId: actor.id, payload: {} }, now);
  let stagePrompt: TransitionResult['stagePrompt'] = null;
  if (done && t.sourceStageId && t.cultureId) {
    const [st] = await tx.select({ stage: cultureStage.stage, actualOn: cultureStage.actualOn }).from(cultureStage).where(eq(cultureStage.id, t.sourceStageId)).limit(1);
    if (st && !st.actualOn) stagePrompt = { cultureId: t.cultureId, stage: st.stage };
  }
  return { ticketId: t.id, status: to, stagePrompt };
}

/** RG-TCK-09 : modification d'un ticket ; pour une occurrence, « celle-ci » (détachée) ou « celle-ci et les suivantes ». */
export async function updateTicket(ctx: ScopedCtx, input: TicketUpdateInput) {
  const { tx, scope, actor } = ctx;
  if (scope.archived) throw forbidden('gardenArchived');
  const t = await loadTicket(tx, scope, input.ticketId);
  const facts = await factsFor(tx, scope, t);
  if (!can(scope, 'ticket:update', facts)) throw forbidden();
  await assertZoneForTicket(tx, scope, t, facts.isAssigned);
  const fields = { type: input.type, actionTag: input.actionTag ?? null, title: input.title, description: input.description ?? null, priority: input.priority };
  if (t.seriesId && !t.detached && input.applyTo === 'following') {
    const [s] = await tx.select().from(ticketSeries).where(eq(ticketSeries.id, t.seriesId)).limit(1);
    if (s) await tx.update(ticketSeries).set({ template: { ...s.template, ...fields } }).where(eq(ticketSeries.id, s.id));
    await tx.update(ticket).set(fields).where(and(
      eq(ticket.seriesId, t.seriesId), eq(ticket.detached, false), gte(ticket.occurrenceOn, t.occurrenceOn ?? '0000-01-01'),
      inArray(ticket.status, ['todo', 'in_progress', 'blocked']), isNull(ticket.deletedAt),
    ));
  } else {
    await tx.update(ticket).set({ ...fields, dueOn: input.dueOn ?? null, titleKey: null, titleParams: null, ...(t.seriesId ? { detached: true } : {}) }).where(eq(ticket.id, t.id));
  }
  await tx.insert(ticketEvent).values({ ticketId: t.id, actorId: actor.id, kind: 'updated', diff: { applyTo: input.applyTo } });
  return { ticketId: t.id };
}

/** RG-TCK-04 : remplace les assignations ; seules les nouvelles personnes sont notifiées. */
export async function assignTicket(ctx: ScopedCtx, ticketId: string, memberIds: string[], groupIds: string[]) {
  const { tx, scope, actor, clock } = ctx;
  if (scope.archived || !can(scope, 'ticket:assign')) throw forbidden();
  const t = await loadTicket(tx, scope, ticketId);
  await assertZoneForTicket(tx, scope, t, (await factsFor(tx, scope, t)).isAssigned);
  const before = await assigneesOf(tx, t.id);
  const next = await assertAssignees(tx, scope, memberIds, groupIds);
  await tx.delete(ticketAssignee).where(eq(ticketAssignee.ticketId, t.id));
  const rows = [...next.memberIds.map((memberId) => ({ gardenId: scope.gardenId, ticketId: t.id, memberId })), ...next.groupIds.map((groupId) => ({ gardenId: scope.gardenId, ticketId: t.id, groupId }))];
  if (rows.length) await tx.insert(ticketAssignee).values(rows);
  await tx.insert(ticketEvent).values({ ticketId: t.id, actorId: actor.id, kind: 'assigned', diff: { memberIds: next.memberIds, groupIds: next.groupIds } });
  const beforeUsers = new Set(await usersOf(tx, before.memberIds, before.groupIds));
  const added = (await usersOf(tx, next.memberIds, next.groupIds)).filter((u) => !beforeUsers.has(u));
  await notify(tx, ctx.jobs, ctx.appUrl, { userIds: added, type: 'assigned', gardenId: scope.gardenId, groupKey: t.id, actorId: actor.id, now: clock.now(), payload: { title: t.title, url: ticketUrl(scope.gardenId, t.id), actorName: await actorName(tx, actor.id) } });
  await emit(tx, { type: 'ticket.assigned', subjectType: 'ticket', subjectId: t.id, gardenId: scope.gardenId, actorId: actor.id, payload: { memberIds: next.memberIds, groupIds: next.groupIds } }, clock.now());
  return { ticketId: t.id };
}

export async function deleteTicket(ctx: ScopedCtx, ticketId: string) {
  const { tx, scope, actor, clock } = ctx;
  const t = await loadTicket(tx, scope, ticketId);
  if (scope.archived || !can(scope, 'ticket:delete', { isOwn: t.createdBy === actor.id })) throw forbidden();
  await assertZoneForTicket(tx, scope, t, (await factsFor(tx, scope, t)).isAssigned);
  await tx.update(ticket).set({ deletedAt: clock.now() }).where(eq(ticket.id, t.id));
  await emit(tx, { type: 'ticket.deleted', subjectType: 'ticket', subjectId: t.id, gardenId: scope.gardenId, actorId: actor.id, payload: {} }, clock.now());
  return { ticketId: t.id };
}

/** Arrête une série : ses occurrences futures non commencées sont supprimées (RG-TCK-09). */
export async function stopSeries(ctx: ScopedCtx, seriesId: string) {
  const { tx, scope, clock } = ctx;
  const [s] = await tx.select().from(ticketSeries).where(and(eq(ticketSeries.id, seriesId), eq(ticketSeries.gardenId, scope.gardenId))).limit(1);
  if (!s) throw notFound();
  if (!can(scope, 'ticket:update', { isOwn: s.createdBy === scope.userId })) throw forbidden();
  const today = await gardenToday(tx, scope.gardenId, clock.now());
  await tx.update(ticketSeries).set({ endedAt: clock.now() }).where(eq(ticketSeries.id, s.id));
  await tx.update(ticket).set({ deletedAt: clock.now() }).where(and(eq(ticket.seriesId, s.id), eq(ticket.status, 'todo'), sql`${ticket.occurrenceOn} > ${today}`, eq(ticket.detached, false)));
  return { seriesId };
}

/* ---------- Checklist et commentaires ---------- */

export async function toggleChecklistItem(ctx: ScopedCtx, itemId: string, done: boolean) {
  const { tx, scope } = ctx;
  if (scope.archived || !can(scope, 'checklist:toggle')) throw forbidden();
  const [row] = await tx.select({ id: ticketChecklistItem.id, ticketId: ticketChecklistItem.ticketId }).from(ticketChecklistItem).innerJoin(ticket, eq(ticket.id, ticketChecklistItem.ticketId))
    .where(and(eq(ticketChecklistItem.id, itemId), eq(ticket.gardenId, scope.gardenId), isNull(ticket.deletedAt))).limit(1);
  if (!row) throw notFound();
  const t = await loadTicket(tx, scope, row.ticketId);
  await assertZoneForTicket(tx, scope, t, (await factsFor(tx, scope, t)).isAssigned);
  await tx.update(ticketChecklistItem).set({ done }).where(eq(ticketChecklistItem.id, row.id));
  return { itemId };
}

export async function addChecklistItem(ctx: ScopedCtx, ticketId: string, label: string) {
  const { tx, scope } = ctx;
  const t = await loadTicket(tx, scope, ticketId);
  const facts = await factsFor(tx, scope, t);
  if (scope.archived || !can(scope, 'ticket:update', facts)) throw forbidden();
  await assertZoneForTicket(tx, scope, t, facts.isAssigned);
  const [{ n } = { n: 0 }] = await tx.select({ n: sql<number>`count(*)::int` }).from(ticketChecklistItem).where(eq(ticketChecklistItem.ticketId, t.id));
  if (n >= 50) throw validation({ label: ['checklistFull'] });
  await tx.insert(ticketChecklistItem).values({ ticketId: t.id, label, sortOrder: n });
  return { ticketId: t.id };
}

/** RG-TCK-14 : commentaire, mentions résolues parmi les membres actifs, notifications. */
export async function addComment(ctx: ScopedCtx, ticketId: string, body: string) {
  const { tx, scope, actor, clock, jobs, appUrl } = ctx;
  if (scope.archived || !can(scope, 'ticket:comment')) throw forbidden();
  const t = await loadTicket(tx, scope, ticketId);
  const pseudos = parseMentions(body);
  const mentioned = pseudos.length === 0 ? [] : await tx.select({ userId: gardenMember.userId, pseudo: userProfile.pseudo }).from(gardenMember)
    .innerJoin(userProfile, eq(userProfile.userId, gardenMember.userId))
    .where(and(eq(gardenMember.gardenId, scope.gardenId), isNull(gardenMember.leftAt), inArray(sql`lower(${userProfile.pseudo})`, pseudos)));
  const [c] = await tx.insert(ticketComment).values({ ticketId: t.id, authorId: actor.id, body, mentions: mentioned.map((m) => m.userId) }).returning({ id: ticketComment.id });
  if (!c) throw new Error('Insertion du commentaire échouée');
  await tx.insert(ticketEvent).values({ ticketId: t.id, actorId: actor.id, kind: 'commented', diff: { commentId: c.id } });
  const name = await actorName(tx, actor.id);
  const payload = { title: t.title, url: ticketUrl(scope.gardenId, t.id), actorName: name, excerpt: body.slice(0, 200) };
  const mentionedIds = mentioned.map((m) => m.userId);
  await notify(tx, jobs, appUrl, { userIds: mentionedIds, type: 'mentioned', gardenId: scope.gardenId, groupKey: t.id, actorId: actor.id, now: clock.now(), payload });
  const a = await assigneesOf(tx, t.id);
  const followers = [t.createdBy, ...(await usersOf(tx, a.memberIds, a.groupIds))].filter((u) => !mentionedIds.includes(u));
  await notify(tx, jobs, appUrl, { userIds: followers, type: 'commented', gardenId: scope.gardenId, groupKey: t.id, actorId: actor.id, now: clock.now(), payload });
  await emit(tx, { type: 'comment.created', subjectType: 'ticket', subjectId: t.id, gardenId: scope.gardenId, actorId: actor.id, payload: { mentions: mentionedIds } }, clock.now());
  return { commentId: c.id };
}

/* ---------- Tickets générés : étapes de culture, arrosage, départs ---------- */

const STAGE_TITLE: Partial<Record<Stage, string>> = { sowing: 'Semer', transplanting: 'Repiquer', planting: 'Planter', harvest_start: 'Récolter', end: 'Terminer' };

/**
 * RG-TCK-10 : un ticket par étape prévue concernée (semis, repiquage, plantation, début de récolte, fin),
 * échéance = date prévue, visible quelques jours avant ; terminé quand la date réelle est saisie ;
 * annulé si la culture est supprimée ou terminée.
 */
export async function syncStageTickets(tx: Executor, gardenId: string, cultureId: string, actorId: string, now: Date) {
  const [c] = await tx.select({ c: culture, names: species.commonNames, varietyName: variety.name, zoneName: zone.name }).from(culture)
    .innerJoin(species, eq(species.id, culture.speciesId)).leftJoin(variety, eq(variety.id, culture.varietyId)).innerJoin(zone, eq(zone.id, culture.zoneId))
    .where(and(eq(culture.gardenId, gardenId), eq(culture.id, cultureId))).limit(1);
  if (!c) return;
  const ended = c.c.deletedAt !== null || c.c.status === 'finished' || c.c.status === 'failed' || c.c.status === 'abandoned';
  const label = [c.names.fr[0], c.varietyName].filter(Boolean).join(' ');
  const [creatorMember] = await tx.select({ id: gardenMember.id }).from(gardenMember)
    .where(and(eq(gardenMember.gardenId, gardenId), eq(gardenMember.userId, c.c.createdBy), isNull(gardenMember.leftAt), ne(gardenMember.role, 'observer'))).limit(1);
  const stages = await tx.select().from(cultureStage).where(eq(cultureStage.cultureId, cultureId));
  for (const st of stages) {
    const lead = STAGE_TICKET_LEAD_DAYS[st.stage];
    if (lead === undefined) continue;
    const [existing] = await tx.select().from(ticket).where(and(eq(ticket.sourceStageId, st.id), isNull(ticket.deletedAt))).limit(1);
    if (st.actualOn || ended) {
      if (existing && isOpen(existing.status)) {
        const to: TicketStatus = st.actualOn ? 'done' : 'cancelled';
        await tx.update(ticket).set({ status: to, ...(to === 'done' ? { completedAt: now, completedBy: actorId, firstCompletedAt: existing.firstCompletedAt ?? now } : {}) }).where(eq(ticket.id, existing.id));
        await tx.insert(ticketEvent).values({ ticketId: existing.id, actorId, kind: 'status', diff: { from: existing.status, to, reason: st.actualOn ? 'stageRecorded' : 'cultureEnded' } });
      }
      continue;
    }
    if (!st.plannedOn) continue;
    const values = {
      title: `${STAGE_TITLE[st.stage] ?? ''} : ${label} (${c.zoneName})`.slice(0, 140), titleKey: `stageTicket.${st.stage}`, titleParams: { culture: label, zone: c.zoneName },
      dueOn: st.plannedOn, visibleFrom: addDaysIso(st.plannedOn, -lead),
    };
    if (existing) {
      if (isOpen(existing.status)) await tx.update(ticket).set(values).where(eq(ticket.id, existing.id));
      continue;
    }
    await insertTicket(tx, {
      gardenId, cultureId, type: 'task', actionTag: st.stage === 'harvest_start' ? 'harvest' : st.stage === 'sowing' ? 'sowing' : st.stage === 'end' ? null : 'planting',
      ...values, source: 'stage', sourceStageId: st.id, createdBy: c.c.createdBy,
    }, [], creatorMember ? [creatorMember.id] : [], []);
  }
}

/** Annule les tickets ouverts d'une culture supprimée (CUL-07, lot 3). */
export async function cancelCultureTickets(tx: Executor, gardenId: string, cultureId: string, actorId: string) {
  const open = await tx.select({ id: ticket.id, status: ticket.status }).from(ticket)
    .where(and(eq(ticket.gardenId, gardenId), eq(ticket.cultureId, cultureId), inArray(ticket.status, ['todo', 'in_progress', 'blocked']), isNull(ticket.deletedAt)));
  for (const t of open) {
    await tx.update(ticket).set({ status: 'cancelled' }).where(eq(ticket.id, t.id));
    await tx.insert(ticketEvent).values({ ticketId: t.id, actorId, kind: 'status', diff: { from: t.status, to: 'cancelled', reason: 'cultureDeleted' } });
  }
  return open.length;
}

/** JRN-05 : « Arroser » termine les tickets d'arrosage échus de la culture, de sa zone ou d'un ancêtre. */
export async function completeWateringTickets(tx: Executor, scope: Scope, target: { cultureId?: string | null | undefined; zoneId?: string | null | undefined }, actorId: string, now: Date) {
  const zoneId = await targetZoneId(tx, scope, target);
  const z = zoneId ? await findZone(tx, scope, zoneId) : null;
  const zoneIds = z ? [...(z.path ? z.path.split('/') : []), z.id] : [];
  const today = await gardenToday(tx, scope.gardenId, now);
  const due = await tx.select({ id: ticket.id, status: ticket.status, firstCompletedAt: ticket.firstCompletedAt }).from(ticket).where(and(
    eq(ticket.gardenId, scope.gardenId), eq(ticket.actionTag, 'watering'), inArray(ticket.status, ['todo', 'in_progress', 'blocked']), isNull(ticket.deletedAt),
    lte(ticket.dueOn, today),
    or(target.cultureId ? eq(ticket.cultureId, target.cultureId) : sql`false`, zoneIds.length ? inArray(ticket.zoneId, zoneIds) : sql`false`),
  ));
  for (const t of due) {
    await tx.update(ticket).set({ status: 'done', completedAt: now, completedBy: actorId, firstCompletedAt: t.firstCompletedAt ?? now }).where(eq(ticket.id, t.id));
    await tx.insert(ticketEvent).values({ ticketId: t.id, actorId, kind: 'status', diff: { from: t.status, to: 'done', reason: 'watered' } });
  }
  return due.map((t) => t.id);
}

/** RG-MBR-02 : retire les assignations directes d'un membre qui part ; renvoie les tickets désormais sans assignation. */
export async function unassignMember(tx: Executor, gardenId: string, memberId: string): Promise<string[]> {
  const rows = await tx.delete(ticketAssignee).where(and(eq(ticketAssignee.gardenId, gardenId), eq(ticketAssignee.memberId, memberId)))
    .returning({ ticketId: ticketAssignee.ticketId });
  return orphanedOpen(tx, rows.map((r) => r.ticketId));
}

/** RG-GRP-02 : retire les assignations d'un groupe archivé ; renvoie les tickets ouverts concernés. */
export async function unassignGroup(tx: Executor, gardenId: string, groupId: string): Promise<{ id: string; createdBy: string; title: string }[]> {
  const rows = await tx.delete(ticketAssignee).where(and(eq(ticketAssignee.gardenId, gardenId), eq(ticketAssignee.groupId, groupId)))
    .returning({ ticketId: ticketAssignee.ticketId });
  if (rows.length === 0) return [];
  return tx.select({ id: ticket.id, createdBy: ticket.createdBy, title: ticket.title }).from(ticket)
    .where(and(inArray(ticket.id, rows.map((r) => r.ticketId)), inArray(ticket.status, ['todo', 'in_progress', 'blocked']), isNull(ticket.deletedAt)));
}

async function orphanedOpen(tx: Executor, ticketIds: string[]) {
  if (ticketIds.length === 0) return [];
  const rows = await tx.select({ id: ticket.id }).from(ticket).where(and(inArray(ticket.id, ticketIds), inArray(ticket.status, ['todo', 'in_progress', 'blocked']), isNull(ticket.deletedAt)));
  const still = await tx.select({ t: ticketAssignee.ticketId }).from(ticketAssignee).where(inArray(ticketAssignee.ticketId, rows.map((r) => r.id)));
  const assigned = new Set(still.map((s) => s.t));
  return rows.filter((r) => !assigned.has(r.id)).map((r) => r.id);
}

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

