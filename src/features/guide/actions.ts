'use server';

import { defineAction } from '@/server/action';
import { guideApplySchema, guideCreateSchema, guideRefSchema, guideUpdateSchema } from './schema';
import * as service from './service';

export const createGuideAction = defineAction({ name: 'guide.create', input: guideCreateSchema, requireVerifiedEmail: true, handler: (ctx, input) => service.createGuide(ctx, input) });
export const updateGuideAction = defineAction({ name: 'guide.update', input: guideUpdateSchema, handler: (ctx, input) => service.updateGuide(ctx, input) });
export const publishGuideAction = defineAction({ name: 'guide.publish', input: guideRefSchema, handler: (ctx, input) => service.publishGuide(ctx, input.guideId) });
export const forkGuideAction = defineAction({ name: 'guide.fork', input: guideRefSchema, requireVerifiedEmail: true, handler: (ctx, input) => service.forkGuide(ctx, input.guideId) });
export const deleteGuideAction = defineAction({ name: 'guide.delete', input: guideRefSchema, handler: (ctx, input) => service.deleteGuide(ctx, input.guideId) });

/** RG-GUI-05 : `guide:apply`, soumis aux restrictions de zone (§5.3). */
export const applyGuideAction = defineAction({
  name: 'guide.apply', input: guideApplySchema, permission: 'guide:apply', gardenId: (i) => i.gardenId,
  handler: (ctx, input) => service.applyGuide(ctx, input),
});
