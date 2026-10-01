'use server';

import { defineAction } from '@/server/action';
import { gardenCreateSchema, gardenDeleteSchema, gardenIdSchema, gardenTransferSchema, gardenUpdateSchema } from './schema';
import * as service from './service';

export const createGardenAction = defineAction({
  name: 'garden.create',
  input: gardenCreateSchema,
  requireVerifiedEmail: true,
  handler: (ctx, input) => service.createGarden(ctx, input),
});

export const updateGardenAction = defineAction({
  name: 'garden.update',
  input: gardenUpdateSchema,
  permission: 'garden:update',
  gardenId: (i) => i.gardenId,
  handler: (ctx, input) => service.updateGarden(ctx, input),
});

export const archiveGardenAction = defineAction({
  name: 'garden.archive',
  input: gardenIdSchema,
  permission: 'garden:archive',
  gardenId: (i) => i.gardenId,
  handler: (ctx) => service.setArchived(ctx, true),
});

export const unarchiveGardenAction = defineAction({
  name: 'garden.unarchive',
  input: gardenIdSchema,
  permission: 'garden:archive',
  gardenId: (i) => i.gardenId,
  handler: (ctx) => service.setArchived(ctx, false),
});

export const deleteGardenAction = defineAction({
  name: 'garden.delete',
  input: gardenDeleteSchema,
  permission: 'garden:delete',
  gardenId: (i) => i.gardenId,
  handler: (ctx, input) => service.deleteGarden(ctx, input.confirmName),
});

export const transferGardenAction = defineAction({
  name: 'garden.transfer',
  input: gardenTransferSchema,
  permission: 'garden:transfer',
  gardenId: (i) => i.gardenId,
  handler: (ctx, input) => service.transferOwnership(ctx, input.toMemberId),
});
