import { and, eq, gte, inArray, isNull, lt, lte, sql } from 'drizzle-orm';
import { localDate } from '@/lib/dates';
import { STAGES } from '@/lib/enums';
import type { Executor } from '@/server/db/client';
import { culture, cultureResult, cultureStage, garden, gardenMember, quest, species, ticket, userProfile, zone, zoneType } from '@/server/db/schema';
import type { EmittedEvent } from '@/server/events/emit';
import { emit } from '@/server/events/emit';
import { myTasksToday } from '../ticket/queries';
import { awardQuest } from './service';
import { astronomicalSeason, pickDaily, pickWeekly, seasonalTemplates, seasonBounds, type SEASONAL_TEMPLATES, weekBounds, type WeeklyCandidate } from './quests.pure';

async function todayOf(tx: Executor, userId: string, now: Date) {
  const [p] = await tx.select({ tz: userProfile.timezone }).from(userProfile).where(eq(userProfile.userId, userId)).limit(1);
  return localDate(now, p?.tz ?? 'Europe/Paris');
}

/**
 * §8.6 : génère les quêtes du jour, de la semaine et de la saison de l'utilisateur (idempotent, par période) et fait
 * expirer les quêtes échues, sans trace d'échec (QST-03).
 */
export async function generateQuests(tx: Executor, userId: string, now: Date) {
  const today = await todayOf(tx, userId, now);
  await tx.update(quest).set({ status: 'expired' }).where(and(eq(quest.userId, userId), eq(quest.status, 'open'), lt(quest.periodEnd, today)));
  // Quotidiennes : tirées de « mes tâches du jour » (QST-01), jamais artificielles (QST-05).
  const tasks = (await myTasksToday(tx, userId, now)).flatMap((g) => g.tasks.map((t) => ({ ticketId: t.id, gardenId: g.gardenId, title: t.title, titleKey: t.titleKey, titleParams: t.titleParams, dueOn: t.dueOn, priority: t.priority })));
  for (const t of pickDaily(tasks, today)) {
    await tx.insert(quest).values({ userId, gardenId: t.gardenId, kind: 'daily', source: 'ticket', ticketId: t.ticketId, titleKey: 'ticket', titleParams: { title: t.title }, periodStart: today, periodEnd: today }).onConflictDoNothing();
  }
  // Hebdomadaires : étapes prévues dans les 7 jours, bilans en attente.
  const week = weekBounds(today);
  const inSeven = new Date(new Date(`${today}T12:00:00Z`).getTime() + 7 * 86_400_000).toISOString().slice(0, 10);
  const stages = await tx.select({ stageId: cultureStage.id, cultureId: culture.id, stage: cultureStage.stage, plannedOn: cultureStage.plannedOn, label: sql<string>`${species.commonNames}->'fr'->>0` })
    .from(cultureStage).innerJoin(culture, eq(culture.id, cultureStage.cultureId)).innerJoin(species, eq(species.id, culture.speciesId))
    .where(and(eq(culture.createdBy, userId), isNull(culture.deletedAt), isNull(cultureStage.actualOn), gte(cultureStage.plannedOn, today), lte(cultureStage.plannedOn, inSeven))).limit(10);
  const pending = await tx.select({ cultureId: culture.id, label: sql<string>`${species.commonNames}->'fr'->>0` }).from(culture).innerJoin(species, eq(species.id, culture.speciesId))
    .where(and(eq(culture.createdBy, userId), isNull(culture.deletedAt), inArray(culture.status, ['finished', 'failed']),
      sql`not exists (select 1 from ${cultureResult} r where r.culture_id = ${culture.id} and r.season_id = ${culture.seasonId})`)).limit(10);
  const weekly: WeeklyCandidate[] = [
    ...stages.flatMap((s) => (s.plannedOn ? [{ kind: 'stage' as const, stageId: s.stageId, cultureId: s.cultureId, stage: s.stage, label: s.label, plannedOn: s.plannedOn }] : [])),
    ...pending.map((p) => ({ kind: 'result' as const, cultureId: p.cultureId, label: p.label })),
  ];
  for (const w of pickWeekly(weekly)) {
    await tx.insert(quest).values(w.kind === 'stage'
      ? { userId, kind: 'weekly', source: 'stage', stageId: w.stageId, cultureId: w.cultureId, titleKey: `stage_${w.stage}`, titleParams: { label: w.label }, periodStart: week.start, periodEnd: week.end }
      : { userId, kind: 'weekly', source: 'result', cultureId: w.cultureId, titleKey: 'result', titleParams: { label: w.label }, periodStart: week.start, periodEnd: week.end }).onConflictDoNothing();
  }
  // Saisonnières : selon l'hémisphère de chaque jardin, et seulement s'il a des zones concernées (QST-04).
  const gardens = await tx.select({ id: garden.id, lat: garden.lat }).from(gardenMember).innerJoin(garden, eq(garden.id, gardenMember.gardenId))
    .where(and(eq(gardenMember.userId, userId), isNull(gardenMember.leftAt), isNull(garden.deletedAt), isNull(garden.archivedAt), sql`${gardenMember.role} <> 'observer'`));
  const bounds = seasonBounds(today);
  for (const g of gardens) {
    const [beds] = await tx.select({ n: sql<number>`count(*)::int` }).from(zone).innerJoin(zoneType, eq(zoneType.id, zone.zoneTypeId)).where(and(eq(zone.gardenId, g.id), eq(zoneType.code, 'bed'), isNull(zone.archivedAt)));
    const [cultures] = await tx.select({ n: sql<number>`count(*)::int` }).from(culture).where(and(eq(culture.gardenId, g.id), isNull(culture.deletedAt), inArray(culture.status, ['planned', 'active'])));
    for (const tpl of seasonalTemplates(astronomicalSeason(today, g.lat < 0), { beds: (beds?.n ?? 0) > 0, cultures: (cultures?.n ?? 0) > 0 })) {
      await tx.insert(quest).values({ userId, gardenId: g.id, kind: 'seasonal', source: 'template', templateCode: tpl.code, titleKey: tpl.titleKey, target: tpl.target, periodStart: bounds.start, periodEnd: bounds.end }).onConflictDoNothing();
    }
  }
}

async function complete(tx: Executor, rows: { id: string; userId: string; kind: 'daily' | 'weekly' | 'seasonal'; gardenId: string | null }[], now: Date) {
  for (const q of rows) {
    const [done] = await tx.update(quest).set({ status: 'done', completedAt: now }).where(and(eq(quest.id, q.id), eq(quest.status, 'open'))).returning({ id: quest.id });
    if (!done) continue;
    await awardQuest(tx, q.userId, q.id, q.kind, q.gardenId, now);
    await emit(tx, { type: 'quest.completed', subjectType: 'user', subjectId: q.userId, gardenId: q.gardenId, actorId: null, payload: { questId: q.id, kind: q.kind } }, now);
  }
}

const TEMPLATE_EVENTS: Record<string, (typeof SEASONAL_TEMPLATES)[number]['code']> = { 'ticket.completed': 'autumn_beds', 'culture.stage_recorded': 'spring_emergences', 'harvest.recorded': 'summer_harvests' };

/** Avancement des quêtes à partir des événements, quelle que soit la vue utilisée (QST-02). */
export async function questsOnEvent(tx: Executor, e: EmittedEvent) {
  const select = { id: quest.id, userId: quest.userId, kind: quest.kind, gardenId: quest.gardenId };
  if (e.type === 'ticket.completed') await complete(tx, await tx.select(select).from(quest).where(and(eq(quest.ticketId, e.subjectId), eq(quest.status, 'open'))), e.occurredAt);
  if (e.type === 'culture.stage_recorded' && typeof e.payload.actualOn === 'string') {
    const stage = STAGES.find((x) => x === e.payload.stage);
    const st = stage ? await tx.select({ id: cultureStage.id }).from(cultureStage).where(and(eq(cultureStage.cultureId, e.subjectId), eq(cultureStage.stage, stage))) : [];
    if (st.length) await complete(tx, await tx.select(select).from(quest).where(and(inArray(quest.stageId, st.map((s) => s.id)), eq(quest.status, 'open'))), e.occurredAt);
  }
  if ((e.type === 'result.submitted' || e.type === 'result.updated') && Number(e.payload.completeness) >= 100) {
    await complete(tx, await tx.select(select).from(quest).where(and(eq(quest.cultureId, String(e.payload.cultureId)), eq(quest.source, 'result'), eq(quest.status, 'open'))), e.occurredAt);
  }
  const code = TEMPLATE_EVENTS[e.type];
  if (!code || !e.actorId || !e.gardenId) return;
  const counts = code === 'autumn_beds'
    ? (await tx.select({ id: ticket.id }).from(ticket).innerJoin(zone, eq(zone.id, ticket.zoneId)).innerJoin(zoneType, eq(zoneType.id, zone.zoneTypeId)).where(and(eq(ticket.id, e.subjectId), eq(ticket.type, 'maintenance'), eq(zoneType.code, 'bed')))).length > 0
    : code === 'spring_emergences' ? e.payload.stage === 'emergence' && typeof e.payload.actualOn === 'string' : true;
  if (!counts) return;
  const open = await tx.update(quest).set({ progress: sql`${quest.progress} + 1` })
    .where(and(eq(quest.userId, e.actorId), eq(quest.gardenId, e.gardenId), eq(quest.templateCode, code), eq(quest.status, 'open'))).returning({ id: quest.id, progress: quest.progress, target: quest.target, userId: quest.userId, kind: quest.kind, gardenId: quest.gardenId });
  await complete(tx, open.filter((q) => q.progress >= q.target), e.occurredAt);
}

/**
 * Quêtes ouvertes, en lecture seule (POL-06 : la génération passe par le job `quests.generate`). Pour traduire les titres
 * (POL-05), chaque quête porte de quoi les recomposer dans la langue de l'interface : le ticket source (titre saisi, ou
 * clé traduisible d'un ticket d'étape) et les noms de l'espèce dans toutes les langues.
 */
export async function questsOf(tx: Executor, userId: string) {
  return tx.select({
    id: quest.id, kind: quest.kind, titleKey: quest.titleKey, titleParams: quest.titleParams, target: quest.target, progress: quest.progress,
    ticket: { title: ticket.title, titleKey: ticket.titleKey, titleParams: ticket.titleParams }, speciesNames: species.commonNames,
  }).from(quest).leftJoin(ticket, eq(ticket.id, quest.ticketId)).leftJoin(culture, eq(culture.id, quest.cultureId)).leftJoin(species, eq(species.id, culture.speciesId))
    .where(and(eq(quest.userId, userId), eq(quest.status, 'open'))).orderBy(quest.kind, quest.periodEnd).limit(30);
}
