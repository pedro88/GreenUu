'use server';

import { defineAction } from '@/server/action';
import { harvestCreateSchema, harvestRefSchema } from './schema';
import { xpForSubject } from '../progression/service';
import * as service from './service';

export const recordHarvestAction = defineAction({
  name: 'harvest.record',
  input: harvestCreateSchema,
  permission: 'journal:create',
  gardenId: (i) => i.gardenId,
  handler: async (ctx, input) => {
    const r = await service.recordHarvest(ctx, input);
    // XP-02 : la réponse annonce le gain (calculé dans la même transaction par l'abonné d'emit).
    return { ...r, xp: await xpForSubject(ctx.tx, ctx.actor.id, r.harvestId) };
  },
});

export const deleteHarvestAction = defineAction({
  name: 'harvest.delete',
  input: harvestRefSchema,
  permission: 'garden:read',
  gardenId: (i) => i.gardenId,
  handler: (ctx, input) => service.deleteHarvest(ctx, input.harvestId),
});
