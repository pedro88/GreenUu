'use server';

import { z } from 'zod';
import { uuidSchema } from '@/lib/zod';
import { defineAction } from '@/server/action';
import { gardenStatsCsv } from './service';

/** STAT-07 : export CSV des statistiques (`garden:export` : owner et admins). */
export const exportStatsAction = defineAction({
  name: 'stats.export', permission: 'garden:export', gardenId: (i) => i.gardenId, readOnly: true,
  input: z.object({ gardenId: uuidSchema }),
  handler: (ctx) => gardenStatsCsv(ctx.tx, ctx.scope),
});
