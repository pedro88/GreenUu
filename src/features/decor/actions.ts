'use server';

import { z } from 'zod';
import { uuidSchema } from '@/lib/zod';
import { defineAction } from '@/server/action';
import { declareDecorPractice } from './service';

/** DEC-03 : déclarer un objet ★ comme pratique réelle du jardin (`garden:update`, vérifié par le service). */
export const declareDecorPracticeAction = defineAction({
  name: 'decor.declarePractice', permission: 'garden:update', gardenId: (i) => i.gardenId,
  input: z.object({ gardenId: uuidSchema, placementId: uuidSchema }),
  handler: (ctx, input) => declareDecorPractice(ctx, input.placementId),
});
