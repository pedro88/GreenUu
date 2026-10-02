import { and, eq } from 'drizzle-orm';
import type { Executor } from '@/server/db/client';
import { userAchievement, xpLedgerEntry } from '@/server/db/schema';
import { astronomicalSeason } from './quests.pure';
import { progressOf } from './service';
import type { UnlockFacts } from './unlock.pure';

/** Progression lue au moment de l'enregistrement (§10.3) : niveau, compétences, succès et saisons d'activité. */
export async function unlockFactsOf(tx: Executor, userId: string): Promise<UnlockFacts> {
  const p = await progressOf(tx, userId);
  const achievements = new Set((await tx.select({ code: userAchievement.achievementCode }).from(userAchievement).where(eq(userAchievement.userId, userId))).map((r) => r.code));
  // Saison astronomique de l'hémisphère nord, comme le succès `all_seasons` (§8.5).
  const days = await tx.selectDistinct({ day: xpLedgerEntry.localDay }).from(xpLedgerEntry).where(and(eq(xpLedgerEntry.userId, userId), eq(xpLedgerEntry.reason, 'award')));
  return { level: p.level, skills: p.skills, achievements, activeSeasons: new Set(days.map((d) => astronomicalSeason(d.day, false))) };
}
