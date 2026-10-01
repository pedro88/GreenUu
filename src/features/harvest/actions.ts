'use server';

import { defineAction } from '@/server/action';
import { harvestCreateSchema, harvestRefSchema } from './schema';
import * as service from './service';

export const recordHarvestAction = defineAction({
  name: 'harvest.record',
  input: harvestCreateSchema,
  permission: 'journal:create',
  gardenId: (i) => i.gardenId,
  handler: (ctx, input) => service.recordHarvest(ctx, input),
});

export const deleteHarvestAction = defineAction({
  name: 'harvest.delete',
  input: harvestRefSchema,
  permission: 'garden:read',
  gardenId: (i) => i.gardenId,
  handler: (ctx, input) => service.deleteHarvest(ctx, input.harvestId),
});
