'use server';

import { defineAction } from '@/server/action';
import { practiceSetSchema } from './schema';
import * as service from './service';

export const setPracticesAction = defineAction({
  name: 'practice.set',
  input: practiceSetSchema,
  permission: 'garden:read',
  gardenId: (i) => i.gardenId,
  handler: (ctx, input) => service.setPractices(ctx, input),
});
