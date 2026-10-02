'use server';

import { z } from 'zod';
import { defineAction } from '@/server/action';
import { saveAvatar } from './service';

/** §10.3 : enregistrement de l'avatar, revalidé en entier par le service (`VALIDATION`, `LOCKED_ITEM`). */
export const saveAvatarAction = defineAction({
  name: 'avatar.save', input: z.object({ config: z.unknown() }),
  handler: (ctx, input) => saveAvatar(ctx, input.config),
});
