/** Commandes du ticketing : création, transitions, modification, assignation, checklist, commentaires. */
import { and, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
import { forbidden, notFound, validation } from '@/lib/errors';
import type { Stage, TicketStatus } from '@/lib/enums';
import type { ScopedCtx } from '@/server/action-core';
import { can } from '@/server/authz/scope';
import { cultureStage, gardenMember, ticket, ticketAssignee, ticketChecklistItem, ticketComment, ticketEvent, ticketSeries, userProfile } from '@/server/db/schema';
import { emit } from '@/server/events/emit';
import { claimAttachments } from '../journal/attachments';
import { notify } from '../notification/service';
import { assertZoneContribute } from '../zone/service';
import { canTransition, parseMentions } from './rules.pure';
import type { TicketCreateInput, TicketUpdateInput } from './schema';
import {
  actorName, assertAssignees, assertZoneForTicket, assigneesOf, factsFor, gardenToday, insertTicket, loadTicket, notifyAssigned, targetZoneId, ticketUrl, usersOf,
} from './shared';
import { materializeSeries } from './generated';

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
