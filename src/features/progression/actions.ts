'use server';

import { uuidSchema, z } from '@/lib/zod';
import { GOAL_METRICS } from '@/lib/enums';
import { defineAction } from '@/server/action';
import { createGoal, setLeaderboard, setLeaderboardOptOut } from './collective';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'invalidDate');
const emptyToUndefined = (v: unknown) => (v === '' || v === null ? undefined : v);

/** §8.7 : objectif collectif (`goal:manage`). */
export const createGoalAction = defineAction({
  name: 'goal.create', permission: 'goal:manage', gardenId: (i) => i.gardenId,
  input: z.object({
    gardenId: uuidSchema, title: z.string().trim().min(3).max(120), metric: z.enum(GOAL_METRICS), target: z.coerce.number().positive().max(100_000),
    periodStart: isoDate, periodEnd: isoDate, groupId: z.preprocess(emptyToUndefined, uuidSchema.optional()),
  }),
  handler: (ctx, input) => createGoal(ctx, input),
});

/** §8.7 : un admin active le classement du jardin. */
export const setLeaderboardAction = defineAction({
  name: 'leaderboard.toggle', permission: 'leaderboard:toggle', gardenId: (i) => i.gardenId,
  input: z.object({ gardenId: uuidSchema, enabled: z.boolean() }),
  handler: (ctx, input) => setLeaderboard(ctx, input.enabled),
});

/** Chaque membre peut s'exclure du classement (choix personnel, tous jardins). */
export const setLeaderboardOptOutAction = defineAction({
  name: 'leaderboard.optOut', input: z.object({ optOut: z.boolean() }),
  handler: (ctx, input) => setLeaderboardOptOut(ctx.tx, ctx.actor.id, input.optOut),
});
