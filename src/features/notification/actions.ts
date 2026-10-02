'use server';

import { uuidSchema, z } from '@/lib/zod';
import { NOTIFICATION_CHANNELS, NOTIFICATION_TYPES } from '@/lib/enums';
import { defineAction } from '@/server/action';
import * as service from './service';

export const markAllReadAction = defineAction({
  name: 'notification.markAllRead', input: z.object({}),
  handler: async (ctx) => { await service.markAllRead(ctx.tx, ctx.actor.id, ctx.clock.now()); return null; },
});

export const markReadAction = defineAction({
  name: 'notification.markRead', input: z.object({ notificationId: uuidSchema }),
  handler: async (ctx, input) => { await service.markRead(ctx.tx, ctx.actor.id, input.notificationId, ctx.clock.now()); return null; },
});

export const setPreferenceAction = defineAction({
  name: 'notification.setPreference', input: z.object({ type: z.enum(NOTIFICATION_TYPES), channel: z.enum(NOTIFICATION_CHANNELS), enabled: z.boolean() }),
  handler: async (ctx, input) => {
    if (input.channel === 'email' && (input.type === 'achievement' || input.type === 'quest')) return null;
    await service.setPreference(ctx.tx, ctx.actor.id, input.type, input.channel, input.enabled);
    return null;
  },
});
