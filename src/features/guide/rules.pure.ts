import { diffLines } from 'diff';
import type { Stage } from '@/lib/enums';
import { slugify } from '@/lib/text';
import { addDaysIso } from '../culture/stages.pure';
import type { GuideCalendarV1 } from '@/lib/content-types';

export const GUIDE_LEAD_DAYS = 3;

/** Slug public d'un guide : titre normalisé + suffixe court tiré de l'ID (unicité sans aller-retour en base). */
export function guideSlug(title: string, id: string): string {
  return `${slugify(title, 60) || 'guide'}-${id.replace(/-/g, '').slice(-6)}`;
}

export type PlannedTask = GuideCalendarV1['tasks'][number] & { dueOn: string; visibleFrom: string };

/**
 * RG-GUI-05 / RG-TCK-11 : dates prévues des étapes à partir de la date d'ancrage, puis échéances des tâches.
 * Une tâche part de la date réelle de son étape si elle existe (les dates réelles priment, on ne les recalcule
 * jamais), sinon de la date calculée, sinon de la date prévue de la culture. Sans aucune date, elle est ignorée.
 */
export function computeCalendar(
  t: GuideCalendarV1, anchorOn: string, known: { actual?: Partial<Record<Stage, string>>; planned?: Partial<Record<Stage, string>> } = {},
): { stages: Partial<Record<Stage, string>>; tasks: PlannedTask[] } {
  const stages: Partial<Record<Stage, string>> = { [t.anchor]: anchorOn };
  for (const s of t.stages) if (s.stage !== t.anchor) stages[s.stage] = addDaysIso(anchorOn, s.offsetDays);
  const tasks = t.tasks.flatMap((task) => {
    const ref = known.actual?.[task.relativeTo] ?? stages[task.relativeTo] ?? known.planned?.[task.relativeTo];
    if (!ref) return [];
    const dueOn = addDaysIso(ref, task.offsetDays);
    return [{ ...task, dueOn, visibleFrom: addDaysIso(dueOn, -(task.leadDays ?? GUIDE_LEAD_DAYS)) }];
  });
  return { stages, tasks };
}

export type DiffLine = { kind: 'added' | 'removed' | 'same'; text: string };

/** RG-GUI-06 : diff ligne à ligne (Markdown, ou JSON indenté pour le contexte et le calendrier). */
export function lineDiff(before: string, after: string): DiffLine[] {
  return diffLines(before, after).flatMap((part) => part.value.replace(/\n$/, '').split('\n')
    .map((text) => ({ kind: part.added ? 'added' as const : part.removed ? 'removed' as const : 'same' as const, text })));
}

export const prettyJson = (v: unknown) => (v === null || v === undefined ? '' : JSON.stringify(v, null, 2));
