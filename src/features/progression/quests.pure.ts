/** Quêtes (SPEC §8.6) : toujours adossées à une tâche réelle, jamais d'échec affiché. Fonctions pures de sélection. */
export const DAILY_MAX = 3;
export const WEEKLY_MAX = 3;

export type TaskCandidate = { ticketId: string; gardenId: string; title: string; titleKey: string | null; titleParams: Record<string, string> | null; dueOn: string | null; priority: 'low' | 'normal' | 'high' | 'urgent' };
const RANK = { urgent: 0, high: 1, normal: 2, low: 3 } as const;

/** QST-01 : au plus 3 quotidiennes, tirées des tâches du jour, retards d'abord puis priorité puis échéance. */
export function pickDaily(tasks: TaskCandidate[], today: string): TaskCandidate[] {
  return [...tasks].sort((a, b) => {
    const la = a.dueOn !== null && a.dueOn < today ? 0 : 1;
    const lb = b.dueOn !== null && b.dueOn < today ? 0 : 1;
    return la - lb || RANK[a.priority] - RANK[b.priority] || (a.dueOn ?? '9999').localeCompare(b.dueOn ?? '9999');
  }).slice(0, DAILY_MAX);
}

export type WeeklyCandidate = { kind: 'stage'; stageId: string; cultureId: string; stage: string; label: string; plannedOn: string } | { kind: 'result'; cultureId: string; label: string };

/** Hebdomadaires : étapes prévues dans les 7 jours, puis bilans en attente (au plus 3). */
export function pickWeekly(candidates: WeeklyCandidate[]): WeeklyCandidate[] {
  return [...candidates].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'stage' ? -1 : 1)).slice(0, WEEKLY_MAX);
}

export type AstronomicalSeason = 'spring' | 'summer' | 'autumn' | 'winter';

/** Saison astronomique selon l'hémisphère (QST-04 : mars au sud = automne). Bornes au 21 des mois de solstice et d'équinoxe. */
export function astronomicalSeason(date: string, south: boolean): AstronomicalSeason {
  const md = date.slice(5);
  const north: AstronomicalSeason = md >= '03-20' && md < '06-21' ? 'spring' : md >= '06-21' && md < '09-22' ? 'summer' : md >= '09-22' && md < '12-21' ? 'autumn' : 'winter';
  if (!south) return north;
  return ({ spring: 'autumn', summer: 'winter', autumn: 'spring', winter: 'summer' } as const)[north];
}

/** Modèles saisonniers : ne s'appliquent qu'aux jardins qui ont des zones concernées (pas de quête artificielle). */
export const SEASONAL_TEMPLATES = [
  { code: 'autumn_beds', season: 'autumn', target: 3, needs: 'beds', titleKey: 'autumnBeds' },
  { code: 'spring_emergences', season: 'spring', target: 5, needs: 'cultures', titleKey: 'springEmergences' },
  { code: 'summer_harvests', season: 'summer', target: 5, needs: 'cultures', titleKey: 'summerHarvests' },
] as const;

export function seasonalTemplates(season: AstronomicalSeason, has: { beds: boolean; cultures: boolean }) {
  return SEASONAL_TEMPLATES.filter((t) => t.season === season && has[t.needs]);
}
