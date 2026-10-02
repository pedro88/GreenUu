'use server';

import { uuidSchema, z } from '@/lib/zod';
import { NOTIFICATION_CHANNELS, NOTIFICATION_TYPES } from '@/lib/enums';
import type { ActionResult } from '@/lib/errors';
import type { NotificationType } from '@/lib/enums';
import { defineAction } from '@/server/action';
import { db } from '@/server/db/client';
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

/**
 * RG-NTF-04 : désinscription sans connexion, sur confirmation explicite (POST).
 * Le jeton signé désigne la personne et le type ; ouvrir le lien (GET) ne modifie rien.
 */
export async function unsubscribeAction(raw: unknown): Promise<ActionResult<{ type: NotificationType }>> {
  const parsed = z.object({ token: z.string().min(1).max(512) }).safeParse(raw);
  const target = parsed.success ? service.unsubscribeTarget(parsed.data.token) : null;
  if (!target) return { ok: false, error: { code: 'NOT_FOUND', message: 'unsubscribeInvalid' } };
  await service.setPreference(db(), target.userId, target.type, 'email', false);
  return { ok: true, data: { type: target.type } };
}
