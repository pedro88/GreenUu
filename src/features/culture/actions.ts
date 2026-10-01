'use server';

import { defineAction } from '@/server/action';
import { uuidSchema, z } from '@/lib/zod';
import { cultureCreateSchema, cultureOutcomeSchema, culturePreviewSchema, cultureRefSchema, cultureUpdateSchema, stageRecordSchema } from './schema';
import { setSeasonClosed } from '../season/service';
import * as service from './service';

export const previewCultureAction = defineAction({
  name: 'culture.preview',
  input: culturePreviewSchema.extend({ plannedDates: cultureCreateSchema.shape.plannedDates }),
  permission: 'garden:read',
  gardenId: (i) => i.gardenId,
  handler: (ctx, input) => service.previewCulture(ctx.tx, ctx.scope, input, input.plannedDates),
});

export const createCultureAction = defineAction({
  name: 'culture.create',
  input: cultureCreateSchema,
  permission: 'culture:create',
  gardenId: (i) => i.gardenId,
  handler: (ctx, input) => service.createCulture(ctx, input),
});

export const recordStageAction = defineAction({
  name: 'culture.recordStage',
  input: stageRecordSchema,
  permission: 'culture:update',
  gardenId: (i) => i.gardenId,
  handler: (ctx, input) => service.recordStage(ctx, input),
});

export const updateCultureAction = defineAction({
  name: 'culture.update',
  input: cultureUpdateSchema,
  permission: 'culture:update',
  gardenId: (i) => i.gardenId,
  handler: (ctx, input) => service.updateCulture(ctx, input),
});

export const cultureOutcomeAction = defineAction({
  name: 'culture.outcome',
  input: cultureOutcomeSchema,
  permission: 'culture:update',
  gardenId: (i) => i.gardenId,
  handler: (ctx, input) => service.setOutcome(ctx, input),
});

export const deleteCultureAction = defineAction({
  name: 'culture.delete',
  input: cultureRefSchema,
  permission: 'garden:read',
  gardenId: (i) => i.gardenId,
  handler: (ctx, input) => service.deleteCulture(ctx, input.cultureId),
});

export const restoreCultureAction = defineAction({
  name: 'culture.restore',
  input: cultureRefSchema,
  permission: 'garden:read',
  gardenId: (i) => i.gardenId,
  handler: (ctx, input) => service.restoreCulture(ctx, input.cultureId),
});

export const seasonCloseAction = defineAction({
  name: 'season.setClosed',
  input: z.object({ gardenId: uuidSchema, year: z.number().int(), closed: z.boolean() }),
  permission: 'garden:update',
  gardenId: (i) => i.gardenId,
  handler: (ctx, input) => setSeasonClosed(ctx, input.year, input.closed),
});
