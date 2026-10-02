'use server';

import { z } from '@/lib/zod';
import { defineAction } from '@/server/action';
import { reportContent } from '../moderation/service';
import { reportSchema, tipCreateSchema, tipVoteSchema } from './schema';
import * as service from './service';

export const createTipAction = defineAction({ name: 'tip.create', input: tipCreateSchema, requireVerifiedEmail: true, handler: (ctx, input) => service.createTip(ctx, input) });
export const voteTipAction = defineAction({ name: 'tip.vote', input: tipVoteSchema, requireVerifiedEmail: true, handler: (ctx, input) => service.voteTip(ctx, input.tipId, input.value) });

export const suggestTagsAction = defineAction({
  name: 'tip.suggestTags', input: z.object({ prefix: z.string().max(40), exclude: z.array(z.string().max(40)).max(5) }), readOnly: true,
  handler: (ctx, input) => service.suggestTags(ctx.tx, input.prefix, input.exclude),
});

export const reportContentAction = defineAction({ name: 'content.report', input: reportSchema, requireVerifiedEmail: true, handler: (ctx, input) => reportContent(ctx, input) });
