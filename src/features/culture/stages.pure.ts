import { addDays as addDaysDate, differenceInCalendarDays, format, parseISO } from 'date-fns';
import { STAGES, type CultureStatus, type HarvestUnit, type Method, type Stage, type VisualModel } from '@/lib/enums';

/** Fonctions pures sur les étapes d'une culture (RG-CUL-01 à 06, RG-JRN-05). Dates ISO `YYYY-MM-DD`. */

const STAGE_ORDER: Record<Stage, number> = Object.fromEntries(STAGES.map((s, i) => [s, i])) as Record<Stage, number>; // as: construit depuis la liste exhaustive STAGES

export function stageOrder(s: Stage): number {
  return STAGE_ORDER[s];
}

const hasFlowering = (m: VisualModel) => m === 'fruit' || m === 'tuber' || m === 'flower' || m === 'tree' || m === 'perennial';
const hasFruiting = (m: VisualModel) => m === 'fruit' || m === 'tree';

/** Étapes pertinentes pour une méthode et un modèle visuel (CUL-01, CUL-05). */
export function stagesFor(method: Method, model: VisualModel): Stage[] {
  const start: Stage[] =
    method === 'direct_sowing' ? ['sowing', 'emergence']
      : method === 'tray_sowing' ? ['sowing', 'emergence', 'transplanting', 'planting']
        : method === 'bulb_tuber' ? ['planting', 'emergence']
          : ['planting'];
  const middle: Stage[] = [...(hasFlowering(model) ? (['flowering'] as const) : []), ...(hasFruiting(model) ? (['fruiting'] as const) : [])];
  return [...start, ...middle, 'harvest_start', 'harvest_end', 'end'];
}

/** Étape qui marque le début de l'occupation de la zone finale (RG-CUL-03). */
export function occupationStartStage(method: Method): Stage {
  return method === 'direct_sowing' ? 'sowing' : 'planting';
}

/** Étape d'ancrage : celle dont l'utilisateur donne la date prévue à la création. */
export function anchorStage(method: Method): Stage {
  return method === 'direct_sowing' || method === 'tray_sowing' ? 'sowing' : 'planting';
}

const iso = (d: Date) => format(d, 'yyyy-MM-dd');
export const addDaysIso = (date: string, days: number) => iso(addDaysDate(parseISO(date), days));
export const daysBetween = (a: string, b: string) => differenceInCalendarDays(parseISO(b), parseISO(a));

/**
 * Dates prévues par défaut à partir de la date d'ancrage et de la durée de culture de l'espèce.
 * Ordres de grandeur volontairement simples, modifiables par l'utilisateur (un guide pourra les remplacer, lot 4).
 */
export function planStages(method: Method, model: VisualModel, anchorDate: string, dtm: { min: number | null; max: number | null }): Partial<Record<Stage, string>> {
  const min = dtm.min ?? 70;
  const max = Math.max(dtm.max ?? min + 30, min);
  const plan: Partial<Record<Stage, string>> = {};
  const stages = stagesFor(method, model);
  let growthStart = anchorDate;
  if (method === 'tray_sowing') {
    plan.sowing = anchorDate;
    plan.emergence = addDaysIso(anchorDate, 8);
    plan.transplanting = addDaysIso(anchorDate, 21);
    plan.planting = addDaysIso(anchorDate, 49);
    growthStart = anchorDate;
  } else if (method === 'direct_sowing') {
    plan.sowing = anchorDate;
    plan.emergence = addDaysIso(anchorDate, 10);
  } else {
    plan.planting = anchorDate;
    if (stages.includes('emergence')) plan.emergence = addDaysIso(anchorDate, 15);
    // Plants achetés : déjà avancés d'environ trois semaines.
    growthStart = method === 'bought_plants' ? addDaysIso(anchorDate, -21) : anchorDate;
  }
  if (stages.includes('flowering')) plan.flowering = addDaysIso(growthStart, Math.round(min * 0.6));
  if (stages.includes('fruiting')) plan.fruiting = addDaysIso(growthStart, Math.round(min * 0.8));
  const harvestStart = addDaysIso(growthStart, min);
  plan.harvest_start = harvestStart < (plan.planting ?? anchorDate) ? addDaysIso(plan.planting ?? anchorDate, 14) : harvestStart;
  plan.harvest_end = addDaysIso(growthStart, max);
  if (plan.harvest_end <= plan.harvest_start) plan.harvest_end = addDaysIso(plan.harvest_start, 14);
  plan.end = addDaysIso(plan.harvest_end, 7);
  return plan;
}

export type StageRow = { stage: Stage; plannedOn: string | null; actualOn: string | null };

const dateOf = (r: StageRow | undefined) => r?.actualOn ?? r?.plannedOn ?? null;

/** Première date (réelle sinon prévue) : sert à rattacher la culture à une saison (RG-CUL-02). */
export function firstDate(stages: StageRow[]): string | null {
  const sorted = [...stages].sort((a, b) => stageOrder(a.stage) - stageOrder(b.stage));
  for (const s of sorted) {
    const d = dateOf(s);
    if (d) return d;
  }
  return null;
}

/** Période d'occupation de la zone (RG-CUL-03). */
export function occupation(method: Method, stages: StageRow[]): { from: string | null; to: string | null } {
  const by = new Map(stages.map((s) => [s.stage, s]));
  const from = dateOf(by.get(occupationStartStage(method))) ?? firstDate(stages);
  const to = dateOf(by.get('end')) ?? dateOf(by.get('harvest_end')) ?? null;
  return { from, to: to && from && to < from ? from : to };
}

/** Statut dérivé des étapes, sauf échec / abandon déclarés explicitement (RG-CUL-04). */
export function deriveStatus(stages: StageRow[], current: CultureStatus): CultureStatus {
  if (current === 'failed' || current === 'abandoned') return current;
  if (stages.some((s) => s.stage === 'end' && s.actualOn)) return 'finished';
  return stages.some((s) => s.actualOn) ? 'active' : 'planned';
}

/** Incohérences d'ordre entre dates réelles : avertissements non bloquants (RG-CUL-05, CUL-04). */
export function orderWarnings(stages: StageRow[]): { before: Stage; after: Stage }[] {
  const real = stages.filter((s): s is StageRow & { actualOn: string } => s.actualOn !== null).sort((a, b) => stageOrder(a.stage) - stageOrder(b.stage));
  const out: { before: Stage; after: Stage }[] = [];
  for (let i = 0; i < real.length; i++) {
    for (let j = i + 1; j < real.length; j++) {
      const a = real[i];
      const b = real[j];
      if (a && b && b.actualOn < a.actualOn) out.push({ before: a.stage, after: b.stage });
    }
  }
  return out;
}

export type AreaSource = 'input' | 'spacing' | 'zone' | 'unknown';

/** Surface de la culture (RG-CUL-06). */
export function cultureArea(input: {
  areaM2: number | null; plantCount: number | null; spacingPlantCm: number | null; spacingRowCm: number | null; zoneSurfaceM2: number | null; aloneOnZone: boolean;
}): { m2: number | null; source: AreaSource } {
  if (input.areaM2 !== null) return { m2: input.areaM2, source: 'input' };
  if (input.plantCount !== null && input.spacingPlantCm !== null && input.spacingRowCm !== null) {
    return { m2: Math.round(input.plantCount * input.spacingPlantCm * input.spacingRowCm / 100) / 100, source: 'spacing' };
  }
  if (input.zoneSurfaceM2 !== null && input.aloneOnZone) return { m2: input.zoneSurfaceM2, source: 'zone' };
  return { m2: null, source: 'unknown' };
}

/** Conversion d'une récolte en kg (RG-JRN-05) ; null si inconvertible. */
export function harvestKg(quantity: number, unit: HarvestUnit, avgUnitWeightG: number | null): number | null {
  switch (unit) {
    case 'kg':
      return quantity;
    case 'g':
      return Math.round(quantity) / 1000;
    case 'unit':
      return avgUnitWeightG === null ? null : Math.round(quantity * avgUnitWeightG) / 1000;
    case 'bunch':
    case 'l':
      return null;
  }
}
