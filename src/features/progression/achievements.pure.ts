/** Registre des succès (SPEC §8.5), en code : condition et avancement calculés sur un résumé de l'historique. */
export type AchievementSummary = {
  emergences: number;
  harvests: number;
  distinctVarieties: number;
  /** Par zone : saisons (année) où il a créé une culture annuelle, et si un avertissement de rotation y a été ignoré. */
  zoneSeasons: { zoneId: string; year: number; override: boolean }[];
  seedSaver: boolean;
  documentedSeason: boolean;
  guidesPublished: number;
  usefulVotes: number;
  collectiveTickets: number;
  /** Saisons astronomiques actives (XP) sur l'année glissante. */
  activeSeasons: number;
};

/** RG ACH-03 : 3 saisons consécutives sur une même zone, sans aucun avertissement de rotation ignoré. */
export function rotationStreak(rows: AchievementSummary['zoneSeasons']): number {
  const byZone = new Map<string, Map<number, boolean>>();
  for (const r of rows) {
    const m = byZone.get(r.zoneId) ?? new Map<number, boolean>();
    m.set(r.year, (m.get(r.year) ?? false) || r.override);
    byZone.set(r.zoneId, m);
  }
  let best = 0;
  for (const years of byZone.values()) {
    const sorted = [...years.keys()].sort((a, b) => a - b);
    let run = 0;
    let prev: number | null = null;
    for (const y of sorted) {
      const clean = years.get(y) === false;
      run = clean && prev !== null && y === prev + 1 && run > 0 ? run + 1 : clean ? 1 : 0;
      prev = y;
      best = Math.max(best, run);
    }
  }
  return best;
}

export const ACHIEVEMENTS = [
  { code: 'first_emergence', target: 1, current: (s: AchievementSummary) => s.emergences },
  { code: 'first_harvest', target: 1, current: (s: AchievementSummary) => s.harvests },
  { code: 'ten_varieties', target: 10, current: (s: AchievementSummary) => s.distinctVarieties },
  { code: 'rotation_3_years', target: 3, current: (s: AchievementSummary) => rotationStreak(s.zoneSeasons) },
  { code: 'seed_saver', target: 1, current: (s: AchievementSummary) => (s.seedSaver ? 1 : 0) },
  { code: 'season_documented', target: 1, current: (s: AchievementSummary) => (s.documentedSeason ? 1 : 0) },
  { code: 'first_guide', target: 1, current: (s: AchievementSummary) => s.guidesPublished },
  { code: 'useful_tips_10', target: 10, current: (s: AchievementSummary) => s.usefulVotes },
  { code: 'collective_active', target: 20, current: (s: AchievementSummary) => s.collectiveTickets },
  { code: 'all_seasons', target: 4, current: (s: AchievementSummary) => s.activeSeasons },
] as const;

export type AchievementCode = (typeof ACHIEVEMENTS)[number]['code'];

/** Avancement borné (« 7 / 10 ») et obtention. */
export function evaluate(s: AchievementSummary) {
  return ACHIEVEMENTS.map((a) => {
    const current = Math.min(a.current(s), a.target);
    return { code: a.code, current, target: a.target, earned: current >= a.target };
  });
}
