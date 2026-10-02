import { and, asc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { forbidden, validation } from '@/lib/errors';
import type { GoalMetric } from '@/lib/enums';
import type { ScopedCtx } from '@/server/action-core';
import { can, type Scope } from '@/server/authz/scope';
import type { Executor } from '@/server/db/client';
import { culture, cultureResult, garden, gardenGoal, gardenGroup, gardenMember, groupMember, harvest, journalEntry, ticket, userAchievement, userProfile, xpLedgerEntry } from '@/server/db/schema';

/* Progression collective (SPEC §8.7) : contributions sans rang, classement facultatif, objectifs de groupe. */

type Period = { from: Date; to: Date };

/** Tableau des contributions par membre actif, trié par ordre alphabétique, sans rang affiché (COL-01). */
export async function contributions(tx: Executor, scope: Scope, p: Period) {
  const members = await tx.select({ userId: gardenMember.userId, pseudo: userProfile.pseudo }).from(gardenMember).innerJoin(userProfile, eq(userProfile.userId, gardenMember.userId))
    .where(and(eq(gardenMember.gardenId, scope.gardenId), isNull(gardenMember.leftAt))).orderBy(asc(userProfile.pseudo));
  const ids = members.map((m) => m.userId);
  if (!ids.length) return [];
  const per = async <T extends { u: string | null; n: number }>(q: Promise<T[]>) => new Map((await q).map((r) => [r.u ?? '', Number(r.n)]));
  const tickets = await per(tx.select({ u: ticket.completedBy, n: sql<number>`count(*)::int` }).from(ticket).where(and(eq(ticket.gardenId, scope.gardenId), inArray(ticket.completedBy, ids), gte(ticket.completedAt, p.from), lte(ticket.completedAt, p.to), isNull(ticket.deletedAt))).groupBy(ticket.completedBy));
  const obs = await per(tx.select({ u: journalEntry.authorId, n: sql<number>`count(*)::int` }).from(journalEntry).where(and(eq(journalEntry.gardenId, scope.gardenId), inArray(journalEntry.authorId, ids), gte(journalEntry.createdAt, p.from), lte(journalEntry.createdAt, p.to), isNull(journalEntry.deletedAt))).groupBy(journalEntry.authorId));
  const harv = await per(tx.select({ u: harvest.authorId, n: sql<number>`count(*)::int` }).from(harvest).where(and(eq(harvest.gardenId, scope.gardenId), inArray(harvest.authorId, ids), gte(harvest.createdAt, p.from), lte(harvest.createdAt, p.to), isNull(harvest.deletedAt))).groupBy(harvest.authorId));
  const res = await per(tx.select({ u: cultureResult.authorId, n: sql<number>`count(*)::int` }).from(cultureResult).where(and(eq(cultureResult.gardenId, scope.gardenId), inArray(cultureResult.authorId, ids), eq(cultureResult.completeness, 100), gte(cultureResult.submittedAt, p.from), lte(cultureResult.submittedAt, p.to))).groupBy(cultureResult.authorId));
  return members.map((m) => ({ ...m, tickets: tickets.get(m.userId) ?? 0, observations: obs.get(m.userId) ?? 0, harvests: harv.get(m.userId) ?? 0, results: res.get(m.userId) ?? 0 }));
}

/** Classement par XP du jardin, si un admin l'a activé ; les membres qui s'en excluent n'y figurent pas (COL-02). */
export async function leaderboard(tx: Executor, scope: Scope) {
  const [g] = await tx.select({ on: garden.leaderboardEnabled }).from(garden).where(eq(garden.id, scope.gardenId)).limit(1);
  if (!g?.on) return null;
  return tx.select({ userId: gardenMember.userId, pseudo: userProfile.pseudo, xp: sql<number>`coalesce((select sum(l.amount) from ${xpLedgerEntry} l where l.user_id = ${gardenMember.userId} and l.garden_id = ${scope.gardenId}), 0)::int` })
    .from(gardenMember).innerJoin(userProfile, eq(userProfile.userId, gardenMember.userId))
    .where(and(eq(gardenMember.gardenId, scope.gardenId), isNull(gardenMember.leftAt), eq(userProfile.leaderboardOptOut, false)))
    .orderBy(sql`3 desc`, asc(userProfile.pseudo)).limit(200);
}

export async function setLeaderboard(ctx: ScopedCtx, enabled: boolean) {
  if (!can(ctx.scope, 'leaderboard:toggle')) throw forbidden();
  await ctx.tx.update(garden).set({ leaderboardEnabled: enabled }).where(eq(garden.id, ctx.scope.gardenId));
  return { enabled };
}

export async function setLeaderboardOptOut(tx: Executor, userId: string, optOut: boolean) {
  await tx.update(userProfile).set({ leaderboardOptOut: optOut }).where(eq(userProfile.userId, userId));
  return { optOut };
}

/** XP du jardin (§8.7) : somme des gains, hors annulations, et niveau au seuil × 5. */
export async function gardenXp(tx: Executor, gardenId: string) {
  const [r] = await tx.select({ n: sql<number>`coalesce(sum(${xpLedgerEntry.amount}) filter (where ${xpLedgerEntry.amount} > 0), 0)::int` }).from(xpLedgerEntry).where(eq(xpLedgerEntry.gardenId, gardenId));
  return r?.n ?? 0;
}

export type GoalInput = { gardenId: string; title: string; metric: GoalMetric; target: number; periodStart: string; periodEnd: string; groupId?: string | undefined };

export async function createGoal(ctx: ScopedCtx, input: GoalInput) {
  const { tx, scope, actor } = ctx;
  if (scope.archived || !can(scope, 'goal:manage')) throw forbidden();
  if (input.periodStart > input.periodEnd) throw validation({ periodEnd: ['periodOrder'] });
  if (input.groupId) {
    // Le groupe ciblé doit appartenir au jardin de l'objectif (même garde que les assignations de tickets).
    const [grp] = await tx.select({ id: gardenGroup.id }).from(gardenGroup)
      .where(and(eq(gardenGroup.id, input.groupId), eq(gardenGroup.gardenId, scope.gardenId), isNull(gardenGroup.archivedAt))).limit(1);
    if (!grp) throw validation({ groupId: ['groupNotFound'] });
  }
  const [g] = await tx.insert(gardenGoal).values({ gardenId: scope.gardenId, groupId: input.groupId ?? null, title: input.title, metric: input.metric, target: input.target, periodStart: input.periodStart, periodEnd: input.periodEnd, createdBy: actor.id }).returning({ id: gardenGoal.id });
  return { goalId: g?.id ?? '' };
}

/** Progression d'un objectif, calculée à la lecture (§8.7, COL-03) ; un objectif de groupe ne compte que ses membres. */
export async function goalsOf(tx: Executor, scope: Scope) {
  const goals = await tx.select().from(gardenGoal).where(and(eq(gardenGoal.gardenId, scope.gardenId), isNull(gardenGoal.archivedAt))).orderBy(asc(gardenGoal.periodEnd)).limit(50);
  const out = [];
  const [gd] = goals.length ? await tx.select({ tz: garden.timezone }).from(garden).where(eq(garden.id, scope.gardenId)).limit(1) : [];
  const tz = gd?.tz ?? 'Europe/Paris';
  for (const g of goals) {
    // La période est en jours locaux du jardin : un instant compte selon sa date à l'heure du jardin (M5, audit lot 6).
    const within = (col: AnyPgColumn) => sql`(${col} at time zone ${tz})::date between ${g.periodStart}::date and ${g.periodEnd}::date`;
    const users = g.groupId
      ? (await tx.select({ u: gardenMember.userId }).from(groupMember).innerJoin(gardenMember, eq(gardenMember.id, groupMember.memberId)).where(eq(groupMember.groupId, g.groupId))).map((r) => r.u)
      : null;
    const who = (col: AnyPgColumn) => (users ? inArray(col, users.length ? users : ['00000000-0000-0000-0000-000000000000']) : undefined);
    let current = 0;
    if (g.metric === 'tickets_completed') current = (await tx.select({ n: sql<number>`count(*)::int` }).from(ticket).where(and(eq(ticket.gardenId, g.gardenId), within(ticket.completedAt), isNull(ticket.deletedAt), who(ticket.completedBy))))[0]?.n ?? 0;
    if (g.metric === 'harvest_kg') current = (await tx.select({ n: sql<number>`coalesce(sum(${harvest.quantityKg}), 0)::float` }).from(harvest).where(and(eq(harvest.gardenId, g.gardenId), gte(harvest.harvestedOn, g.periodStart), lte(harvest.harvestedOn, g.periodEnd), isNull(harvest.deletedAt), who(harvest.authorId))))[0]?.n ?? 0;
    if (g.metric === 'observations') current = (await tx.select({ n: sql<number>`count(*)::int` }).from(journalEntry).where(and(eq(journalEntry.gardenId, g.gardenId), within(journalEntry.observedAt), isNull(journalEntry.deletedAt), who(journalEntry.authorId))))[0]?.n ?? 0;
    if (g.metric === 'results_complete') current = (await tx.select({ n: sql<number>`count(*)::int` }).from(cultureResult).where(and(eq(cultureResult.gardenId, g.gardenId), eq(cultureResult.completeness, 100), within(cultureResult.submittedAt), who(cultureResult.authorId))))[0]?.n ?? 0;
    if (g.metric === 'cultures_started') current = (await tx.select({ n: sql<number>`count(*)::int` }).from(culture).where(and(eq(culture.gardenId, g.gardenId), within(culture.createdAt), isNull(culture.deletedAt), who(culture.createdBy))))[0]?.n ?? 0;
    out.push({ ...g, current: Math.round(current * 10) / 10 });
  }
  return out;
}

/**
 * Succès collectifs (PAGES.md §4 `/progression`) : succès obtenus par les membres actifs du jardin, avec le nombre de
 * membres qui les ont et leurs pseudos (pas de rang). Un succès est personnel et vaut pour tous ses jardins (§8.5).
 */
export async function collectiveAchievements(tx: Executor, scope: Scope) {
  const rows = await tx.select({ code: userAchievement.achievementCode, pseudo: userProfile.pseudo, earnedAt: userAchievement.earnedAt }).from(userAchievement)
    .innerJoin(gardenMember, and(eq(gardenMember.userId, userAchievement.userId), eq(gardenMember.gardenId, scope.gardenId), isNull(gardenMember.leftAt)))
    .innerJoin(userProfile, eq(userProfile.userId, userAchievement.userId))
    .orderBy(asc(userAchievement.earnedAt)).limit(500);
  const by = new Map<string, string[]>();
  for (const r of rows) by.set(r.code, [...(by.get(r.code) ?? []), r.pseudo]);
  return [...by].map(([code, members]) => ({ code, members: [...members].sort() }));
}
