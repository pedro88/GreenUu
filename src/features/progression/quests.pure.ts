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

/** Bornes de la saison astronomique en cours (période d'une quête saisonnière) ; seule l'étiquette change selon l'hémisphère. */
export function seasonBounds(date: string): { start: string; end: string } {
  const y = Number(date.slice(0, 4));
  const s = astronomicalSeason(date, false);
  const md = date.slice(5);
  const bounds: Record<AstronomicalSeason, [string, string]> = {
    spring: [`${y}-03-20`, `${y}-06-20`], summer: [`${y}-06-21`, `${y}-09-21`], autumn: [`${y}-09-22`, `${y}-12-20`],
    winter: md >= '12-21' ? [`${y}-12-21`, `${y + 1}-03-19`] : [`${y - 1}-12-21`, `${y}-03-19`],
  };
  const [start, end] = bounds[s];
  return { start, end };
}

/** Lundi et dimanche de la semaine d'une date ISO (quêtes hebdomadaires). */
export function weekBounds(date: string): { start: string; end: string } {
  const d = new Date(`${date}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  const start = new Date(d.getTime() - dow * 86_400_000);
  const end = new Date(start.getTime() + 6 * 86_400_000);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

type LocalizedNames = { fr: string[]; en?: string[] | undefined };
export type QuestTitleSource = {
  titleKey: string;
  titleParams: Record<string, string | number> | null;
  ticket: { title: string; titleKey: string | null; titleParams: Record<string, string> | null } | null;
  speciesNames: LocalizedNames | null;
};

/**
 * Paramètres du titre d'une quête dans la langue de l'interface (POL-05) : le titre du ticket source (traduit si c'est
 * un ticket d'étape, sinon tel que saisi) et le nom de l'espèce dans la langue demandée, à défaut en français. Les
 * paramètres enregistrés servent de repli (ticket ou culture supprimés).
 */
export function questTitleParams(q: QuestTitleSource, locale: 'fr' | 'en', ticketTitle: (t: NonNullable<QuestTitleSource['ticket']>) => string): Record<string, string | number> {
  const params = { ...(q.titleParams ?? {}) };
  if (q.titleKey === 'ticket' && q.ticket) params.title = ticketTitle(q.ticket);
  const name = q.speciesNames ? (q.speciesNames[locale]?.[0] ?? q.speciesNames.fr[0]) : undefined;
  if (name && 'label' in params) params.label = name;
  return params;
}
