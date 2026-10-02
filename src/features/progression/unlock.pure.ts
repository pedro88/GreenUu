import { z } from 'zod';
import { ASTRONOMICAL_SEASONS, SKILL_DOMAINS, type Skill } from '@/lib/enums';
import { ACHIEVEMENTS, type AchievementCode } from './achievements.pure';
import { skillLevelOf } from './rules.pure';

/*
 * Conditions de déblocage des objets de déco et des éléments d'avatar (SPEC §4.5 `UnlockConditionV1`). Évaluées côté
 * serveur au moment de l'enregistrement, d'après la progression de l'utilisateur ; le client ne fait que les afficher.
 */

const achievementCodes = ACHIEVEMENTS.map((a) => a.code) as [AchievementCode, ...AchievementCode[]]; // as: registre non vide

export const unlockConditionSchema = z.discriminatedUnion('kind', [
  z.object({ v: z.literal(1), kind: z.literal('none') }),
  z.object({ v: z.literal(1), kind: z.literal('level'), min: z.number().int().min(1) }),
  /** `min` est un niveau de compétence (seuil_c, §8.4). */
  z.object({ v: z.literal(1), kind: z.literal('skill'), skill: z.enum(SKILL_DOMAINS), min: z.number().int().min(1) }),
  z.object({ v: z.literal(1), kind: z.literal('achievement'), code: z.enum(achievementCodes) }),
  /** Au moins une action génératrice d'XP pendant cette saison astronomique. */
  z.object({ v: z.literal(1), kind: z.literal('season_active'), season: z.enum(ASTRONOMICAL_SEASONS) }),
]);
export type UnlockConditionV1 = z.infer<typeof unlockConditionSchema>;

export const NO_CONDITION: UnlockConditionV1 = { v: 1, kind: 'none' };

/** Ce que l'on sait de la progression d'un utilisateur, pour évaluer une condition. */
export type UnlockFacts = {
  level: number;
  skills: Partial<Record<Skill, number>>;
  achievements: ReadonlySet<string>;
  activeSeasons: ReadonlySet<(typeof ASTRONOMICAL_SEASONS)[number]>;
};

export const NO_PROGRESS: UnlockFacts = { level: 1, skills: {}, achievements: new Set(), activeSeasons: new Set() };

export function isUnlocked(c: UnlockConditionV1, f: UnlockFacts): boolean {
  switch (c.kind) {
    case 'none': return true;
    case 'level': return f.level >= c.min;
    case 'skill': return skillLevelOf(f.skills[c.skill] ?? 0) >= c.min;
    case 'achievement': return f.achievements.has(c.code);
    case 'season_active': return f.activeSeasons.has(c.season);
  }
}
