'use server';

import { defineAction } from '@/server/action';
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
