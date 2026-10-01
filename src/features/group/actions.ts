'use server';

import { defineAction } from '@/server/action';
import { groupCreateSchema, groupRefSchema, groupUpdateSchema } from './schema';
import * as service from './service';

export const createGroupAction = defineAction({
  name: 'group.create',
  input: groupCreateSchema,
  permission: 'group:manage',
  gardenId: (i) => i.gardenId,
  handler: (ctx, input) => service.createGroup(ctx, input),
});

export const updateGroupAction = defineAction({
  name: 'group.update',
  input: groupUpdateSchema,
  permission: 'group:manage',
  gardenId: (i) => i.gardenId,
  handler: (ctx, input) => service.updateGroup(ctx, input.groupId, input),
});

export const archiveGroupAction = defineAction({
  name: 'group.archive',
  input: groupRefSchema,
  permission: 'group:manage',
  gardenId: (i) => i.gardenId,
  handler: (ctx, input) => service.archiveGroup(ctx, input.groupId),
});
