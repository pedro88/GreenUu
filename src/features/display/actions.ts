'use server';

import { DEFAULT_VIEWS } from '@/lib/enums';
import { z } from '@/lib/zod';
import { defineAction } from '@/server/action';
import { setDisplayPrefs } from './service';

/** MAP-12 : la vue choisie (gamifiée ou classique) devient la vue par défaut ; option « animations réduites » (MAP-09). */
export const setDisplayPrefsAction = defineAction({
  name: 'display.update',
  input: z.object({ defaultView: z.enum(DEFAULT_VIEWS).optional(), reducedMotion: z.boolean().optional() }),
  handler: (ctx, input) => setDisplayPrefs(ctx.tx, ctx.actor.id, input),
});
