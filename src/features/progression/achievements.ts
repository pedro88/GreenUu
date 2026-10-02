import { and, count, countDistinct, eq, gte, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import type { Executor } from '@/server/db/client';
import { culture, cultureStage, garden, guide, harvest, ticket, userAchievement, xpLedgerEntry } from '@/server/db/schema';
import { emit } from '@/server/events/emit';
import { notify } from '../notification/service';
import { ACHIEVEMENTS, type AchievementSummary, evaluate } from './achievements.pure';
import { astronomicalSeason } from './quests.pure';

/** Résumé de l'historique d'un utilisateur, dans tous ses jardins, pour le registre des succès (§8.5). */
export async function summaryOf(tx: Executor, userId: string, now: Date): Promise<AchievementSummary> {
  const [emergences] = await tx.select({ n: count() }).from(cultureStage).where(and(eq(cultureStage.recordedBy, userId), eq(cultureStage.stage, 'emergence'), isNotNull(cultureStage.actualOn)));
  const [harvests] = await tx.select({ n: count() }).from(harvest).where(eq(harvest.authorId, userId));
  const [varieties] = await tx.select({ n: countDistinct(sql`coalesce(${culture.varietyId}, ${culture.speciesId})`) }).from(culture).where(eq(culture.createdBy, userId));
  const zoneSeasons = await tx.execute<{ zone_id: string; year: number; override: boolean }>(sql`
    select c.zone_id, s.year, bool_or(c.rotation_override) as override from culture c join season s on s.id = c.season_id join species sp on sp.id = c.species_id
    where c.created_by = ${userId} and not sp.perennial group by c.zone_id, s.year`);
  const seedSaver = await tx.execute<{ ok: boolean }>(sql`
    select exists (select 1 from culture c join culture_stage st on st.culture_id = c.id and st.stage = 'emergence' and st.actual_on is not null
      where c.created_by = ${userId} and c.seed_source = 'own_saved'
        and exists (select 1 from harvest h where h.culture_id = c.seed_parent_culture_id and h.seed_saving and h.deleted_at is null)) as ok`);
  const documented = await tx.execute<{ ok: boolean }>(sql`
    select exists (select 1 from season s where s.status = 'closed' and (
      select count(*) from culture c where c.season_id = s.id and c.created_by = ${userId} and c.deleted_at is null) >= 5
      and not exists (select 1 from culture c where c.season_id = s.id and c.created_by = ${userId} and c.deleted_at is null and (
        not exists (select 1 from culture_result r where r.culture_id = c.id and r.completeness = 100)
        or (select count(*) from journal_entry j where j.culture_id = c.id and j.deleted_at is null) < 3))) as ok`);
  const [guides] = await tx.select({ n: count() }).from(guide).where(and(eq(guide.authorId, userId), isNotNull(guide.currentVersionId), sql`${guide.visibility} <> 'private'`));
  const [votes] = await tx.select({ n: count() }).from(xpLedgerEntry).where(and(eq(xpLedgerEntry.userId, userId), eq(xpLedgerEntry.actionCode, 'tip.useful_vote'), sql`${xpLedgerEntry.amount} > 0`));
  const [collective] = await tx.select({ n: count() }).from(ticket).innerJoin(garden, eq(garden.id, ticket.gardenId))
    .where(and(eq(ticket.completedBy, userId), inArray(garden.orgType, ['collective', 'association', 'educational']), isNull(ticket.deletedAt)));
  const days = await tx.selectDistinct({ day: xpLedgerEntry.localDay }).from(xpLedgerEntry)
    .where(and(eq(xpLedgerEntry.userId, userId), eq(xpLedgerEntry.reason, 'award'), gte(xpLedgerEntry.localDay, new Date(now.getTime() - 365 * 86_400_000).toISOString().slice(0, 10))));
  return {
    emergences: emergences?.n ?? 0, harvests: harvests?.n ?? 0, distinctVarieties: varieties?.n ?? 0,
    zoneSeasons: [...zoneSeasons].map((r) => ({ zoneId: r.zone_id, year: Number(r.year), override: r.override })),
    seedSaver: [...seedSaver][0]?.ok ?? false, documentedSeason: [...documented][0]?.ok ?? false, guidesPublished: guides?.n ?? 0,
    usefulVotes: votes?.n ?? 0, collectiveTickets: collective?.n ?? 0, activeSeasons: new Set(days.map((d) => astronomicalSeason(d.day, false))).size,
  };
}

/** Évalue et attribue les succès (idempotents, jamais retirés, ACH-04), avec une notification in-app (jamais d'e-mail). */
export async function awardAchievements(tx: Executor, userId: string, gardenId: string | null, now: Date) {
  const owned = new Set((await tx.select({ code: userAchievement.achievementCode }).from(userAchievement).where(eq(userAchievement.userId, userId))).map((r) => r.code));
  if (owned.size === ACHIEVEMENTS.length) return [];
  const earned = evaluate(await summaryOf(tx, userId, now)).filter((a) => a.earned && !owned.has(a.code));
  for (const a of earned) {
    const [row] = await tx.insert(userAchievement).values({ userId, achievementCode: a.code, gardenId, earnedAt: now, evidence: { current: a.current, target: a.target } }).onConflictDoNothing().returning();
    if (!row) continue;
    await notify(tx, { enqueue: async () => undefined }, '', { userIds: [userId], type: 'achievement', gardenId, groupKey: a.code, actorId: null, now, payload: { title: a.code, url: '/app/profil/succes' } });
    await emit(tx, { type: 'achievement.earned', subjectType: 'user', subjectId: userId, gardenId, actorId: null, payload: { code: a.code } }, now);
  }
  return earned.map((a) => a.code);
}

/** Grille de `/app/profil/succes` : obtenus (datés) et verrouillés (condition et avancement, ACH-05). */
export async function achievementsOf(tx: Executor, userId: string, now: Date) {
  const owned = new Map((await tx.select().from(userAchievement).where(eq(userAchievement.userId, userId))).map((r) => [r.achievementCode, r.earnedAt]));
  return evaluate(await summaryOf(tx, userId, now)).map((a) => ({ ...a, earnedAt: owned.get(a.code) ?? null, earned: owned.has(a.code) }));
}

