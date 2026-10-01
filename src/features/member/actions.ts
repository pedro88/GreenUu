'use server';

import { defineAction } from '@/server/action';
import { changeRoleSchema, invitationRefSchema, inviteSchema, memberRefSchema } from './schema';
import { gardenIdSchema } from '../garden/schema';
import * as service from './service';

export const inviteAction = defineAction({
  name: 'member.invite',
  input: inviteSchema,
  permission: 'member:invite',
  gardenId: (i) => i.gardenId,
  handler: (ctx, input) => service.invite(ctx, input),
});

export const revokeInvitationAction = defineAction({
  name: 'member.revokeInvitation',
  input: invitationRefSchema,
  permission: 'member:invite',
  gardenId: (i) => i.gardenId,
  handler: (ctx, input) => service.revokeInvitation(ctx, input.invitationId),
});

export const changeRoleAction = defineAction({
  name: 'member.changeRole',
  input: changeRoleSchema,
  permission: 'member:change_role',
  gardenId: (i) => i.gardenId,
  handler: (ctx, input) => service.changeRole(ctx, input.memberId, input.role),
});

export const removeMemberAction = defineAction({
  name: 'member.remove',
  input: memberRefSchema,
  permission: 'member:remove',
  gardenId: (i) => i.gardenId,
  handler: (ctx, input) => service.removeMember(ctx, input.memberId),
});

export const leaveGardenAction = defineAction({
  name: 'member.leave',
  input: gardenIdSchema,
  permission: 'garden:read',
  gardenId: (i) => i.gardenId,
  handler: (ctx) => service.leave(ctx),
});
