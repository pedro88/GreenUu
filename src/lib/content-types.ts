import type { ACTION_TAGS, Environment, Stage, TicketType } from './enums';

/* Schémas JSON versionnés des guides (SPEC §4.5), partagés entre la base, les services et l'UI. */

/** SPEC §4.5 `guide_version.context`. */
export type GuideContextV1 = { v: 1; koppen?: string[] | undefined; environments?: Environment[] | undefined; practices?: string[] | undefined; altitudeMaxM?: number | undefined; hemisphere?: 'N' | 'S' | undefined };

/** SPEC §4.5 `guide_version.calendar_template` (V1 : tâches sans récurrence, cf. journal 0.7). */
export type GuideCalendarV1 = {
  v: 1;
  anchor: 'sowing' | 'planting';
  stages: { stage: Stage; offsetDays: number }[];
  tasks: { title: string; type: TicketType; actionTag?: (typeof ACTION_TAGS)[number] | undefined; relativeTo: Stage; offsetDays: number; leadDays?: number | undefined }[];
};

/** Brouillon en cours : ce que la prochaine publication figera dans une version. */
export type GuideDraft = { title: string; bodyMd: string; context: GuideContextV1; calendarTemplate: GuideCalendarV1 | null; changeNote?: string | undefined };
