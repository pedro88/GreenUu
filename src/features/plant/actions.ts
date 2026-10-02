'use server';

import { defineAction } from '@/server/action';
import { uuidSchema, z } from '@/lib/zod';
import { varietyModerateSchema, varietyProposeSchema } from './schema';
import * as service from './service';

/** Le jardin est vérifié dans le service (membre non observateur) : la proposition n'est pas une action « de jardin ». */
export const proposeVarietyAction = defineAction({
  name: 'variety.propose',
  input: varietyProposeSchema,
  requireVerifiedEmail: true,
  handler: (ctx, input) => service.proposeVariety(ctx, input),
});

export const moderateVarietyAction = defineAction({
  name: 'variety.moderate',
  input: varietyModerateSchema,
  handler: (ctx, input) => service.moderateVariety(ctx, input),
});

export const searchPlantsAction = defineAction({
  name: 'plant.search',
  readOnly: true,
  input: z.object({ q: z.string().max(80) }),
  handler: (ctx, input) => service.searchPlants(ctx.tx, ctx.actor.id, input.q, 12),
});

export const gardenVarietiesAction = defineAction({
  name: 'plant.gardenVarieties',
  readOnly: true,
  input: z.object({ gardenId: uuidSchema, speciesId: uuidSchema }),
  permission: 'garden:read',
  gardenId: (i) => i.gardenId,
  handler: (ctx, input) => service.varietiesForGarden(ctx.tx, input.speciesId, ctx.scope.gardenId),
});
