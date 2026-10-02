'use server';

import { z } from '@/lib/zod';
import { defineAction } from '@/server/action';
import { reportSchema } from '../tip/schema';
import { decideReports } from './service';

/** RG-MOD-03 : décision de la modération sur un contenu signalé (moderator ou admin plateforme). */
export const decideReportsAction = defineAction({
  name: 'moderation.decide', input: z.object({ target: reportSchema.shape.target, decision: z.enum(['dismissed', 'actioned']) }),
  handler: (ctx, input) => decideReports(ctx, input.target, input.decision),
});
