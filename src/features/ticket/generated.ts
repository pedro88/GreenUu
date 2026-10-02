/** Tickets générés : occurrences récurrentes, tickets d'étape, arrosage, départs de membres et de groupes. */
import { and, asc, eq, inArray, isNull, lte, ne, or, sql } from 'drizzle-orm';
import type { Stage, TicketStatus } from '@/lib/enums';
import type { Scope } from '@/server/authz/scope';
import type { Executor } from '@/server/db/client';
import { culture, cultureStage, gardenMember, species, ticket, ticketAssignee, ticketEvent, variety, zone } from '@/server/db/schema';
import type { ticketSeries } from '@/server/db/schema';
import { addDaysIso } from '../culture/stages.pure';
import { findZone } from '../zone/repo';
import { isOpen, occurrencesBetween, STAGE_TICKET_LEAD_DAYS } from './rules.pure';
import { MATERIALIZE_HORIZON_DAYS, gardenToday, insertTicket, targetZoneId } from './shared';

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
