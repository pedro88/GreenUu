import type { CultureStatus, Method, Stage, VisualModel } from '@/lib/enums';

/* Phase visuelle d'une culture (SPEC §9.3) et états visuels (§9.4). Fonctions pures, sans base ni DOM. */

export const VISUAL_PHASES = ['seed', 'sprout', 'growing', 'flowering', 'fruiting', 'harvest_ready', 'seed_set', 'dormant', 'finished'] as const;
export type VisualPhase = (typeof VISUAL_PHASES)[number];

/** Ordre des étapes d'une culture, du semis à la fin. */
export const STAGE_ORDER: readonly Stage[] = ['sowing', 'emergence', 'transplanting', 'planting', 'flowering', 'fruiting', 'harvest_start', 'harvest_end', 'seed_set', 'end'];

const PHASE_OF: Record<Stage, VisualPhase> = {
  sowing: 'seed', emergence: 'sprout', transplanting: 'growing', planting: 'growing', flowering: 'flowering', fruiting: 'fruiting',
  harvest_start: 'harvest_ready', harvest_end: 'harvest_ready', seed_set: 'seed_set', end: 'finished',
};

/** Au-delà de ce retard sur une étape prévue sans date réelle, la culture demande une confirmation (§9.3, point 2). */
export const CONFIRMATION_DELAY_DAYS = 7;
/** Une culture terminée reste visible ce nombre de jours sur le plan (§9.3, point 5). */
export const FINISHED_VISIBLE_DAYS = 14;

export type PhaseInput = {
  method: Method;
  status: CultureStatus;
  perennial: boolean;
  visualModel: VisualModel;
  stages: { stage: Stage; plannedOn: string | null; actualOn: string | null }[];
  /** Date de fin (étape `end` réelle, ou dernière mise à jour du statut), pour la visibilité des cultures terminées. */
  endedOn?: string | null;
};

export type PhaseResult = { phase: VisualPhase; progress: number; needsConfirmation: boolean; visible: boolean };

const DAY = 86_400_000;
const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const daysBetween = (a: string, b: string) => Math.round((day(b) - day(a)) / DAY);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Saison hivernale de l'hémisphère : décembre à février au nord, juin à août au sud. */
export function isWinter(today: string, south: boolean): boolean {
  const m = Number(today.slice(5, 7));
  return south ? m >= 6 && m <= 8 : m === 12 || m <= 2;
}

/**
 * `visualPhase(culture, today)` (§9.3) :
 * 1. l'étape réelle la plus avancée (≤ aujourd'hui) fixe la phase de base ;
 * 2. la progression est interpolée jusqu'à la prochaine étape prévue ; une étape prévue atteinte fait basculer d'une seule
 *    phase, avec `needsConfirmation` au-delà de 7 jours de retard ;
 * 3. une culture en plants achetés commence en `growing` ;
 * 4. une vivace en hiver, sans étape en cours, est `dormant` ;
 * 5. une culture terminée reste 14 jours en `finished`, puis disparaît du plan.
 */
export function visualPhase(c: PhaseInput, today: string, opts: { south?: boolean } = {}): PhaseResult {
  if (c.status === 'finished' || c.status === 'failed' || c.status === 'abandoned') {
    const ended = c.endedOn ?? c.stages.find((s) => s.stage === 'end')?.actualOn ?? null;
    return { phase: 'finished', progress: 1, needsConfirmation: false, visible: ended !== null && daysBetween(ended, today) <= FINISHED_VISIBLE_DAYS };
  }
  const ordered = [...c.stages].sort((a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage));
  const real = ordered.filter((s) => s.actualOn !== null && s.actualOn <= today);
  const last = real[real.length - 1];
  const lastIdx = last ? STAGE_ORDER.indexOf(last.stage) : -1;
  let phase: VisualPhase = last ? PHASE_OF[last.stage] : c.method === 'bought_plants' ? 'growing' : 'seed';
  let from: string | null = last?.actualOn ?? null;
  if (phase === 'finished') return { phase, progress: 1, needsConfirmation: false, visible: from !== null && daysBetween(from, today) <= FINISHED_VISIBLE_DAYS };

  // Étapes prévues encore sans date réelle, après la dernière étape réelle.
  const upcoming = ordered.filter((s) => STAGE_ORDER.indexOf(s.stage) > lastIdx && s.actualOn === null && s.plannedOn !== null);
  const next = upcoming[0];
  let needsConfirmation = false;
  let to: string | null = next?.plannedOn ?? null;
  if (next?.plannedOn && next.plannedOn <= today) {
    // Bascule visuelle d'une seule phase vers l'étape prévue atteinte.
    phase = PHASE_OF[next.stage];
    needsConfirmation = daysBetween(next.plannedOn, today) > CONFIRMATION_DELAY_DAYS;
    from = next.plannedOn;
    to = upcoming[1]?.plannedOn ?? null;
  }
  const progress = from && to && day(to) > day(from) ? clamp01(daysBetween(from, today) / daysBetween(from, to)) : 0;

  const perennialLike = c.perennial || c.visualModel === 'perennial' || c.visualModel === 'tree';
  if (perennialLike && isWinter(today, opts.south ?? false)) {
    const recent = ordered.some((s) => [s.actualOn, s.plannedOn].some((d) => d !== null && Math.abs(daysBetween(d, today)) <= 30));
    if (!recent) return { phase: 'dormant', progress: 0, needsConfirmation: false, visible: true };
  }
  return { phase, progress: Math.round(progress * 100) / 100, needsConfirmation, visible: true };
}

/** États visuels, dans l'ordre de priorité de §9.4 ; au plus 2 sont affichés à la fois. */
export const VISUAL_STATES = ['overdue_ticket', 'thirsty', 'disease', 'pest', 'harvest_ready', 'needs_confirmation', 'assigned_to_me'] as const;
export type VisualState = (typeof VISUAL_STATES)[number];
export const MAX_VISIBLE_STATES = 2;

export function orderStates(states: Iterable<VisualState>): VisualState[] {
  const set = new Set(states);
  return VISUAL_STATES.filter((s) => set.has(s));
}
