'use server';

import { defineAction } from '@/server/action';
import {
  checklistAddSchema, checklistToggleSchema, commentSchema, seriesRefSchema, ticketAssignSchema, ticketCreateSchema, ticketRefSchema,
  ticketTransitionSchema, ticketUpdateSchema,
} from './schema';
import * as service from './commands';

/* Les règles « propre / assigné » et les restrictions de zone sont appliquées par le service (SPEC §5.2, §5.3). */

export const createTicketAction = defineAction({
  name: 'ticket.create', input: ticketCreateSchema, permission: 'ticket:create', gardenId: (i) => i.gardenId,
  handler: (ctx, input) => service.createTicket(ctx, input),
});

export const updateTicketAction = defineAction({
  name: 'ticket.update', input: ticketUpdateSchema, permission: 'garden:read', gardenId: (i) => i.gardenId,
  handler: (ctx, input) => service.updateTicket(ctx, input),
});

export const transitionTicketAction = defineAction({
  name: 'ticket.transition', input: ticketTransitionSchema, permission: 'garden:read', gardenId: (i) => i.gardenId,
  handler: (ctx, input) => service.transitionTicket(ctx, input.ticketId, input.status),
});

export const assignTicketAction = defineAction({
  name: 'ticket.assign', input: ticketAssignSchema, permission: 'ticket:assign', gardenId: (i) => i.gardenId,
  handler: (ctx, input) => service.assignTicket(ctx, input.ticketId, input.memberIds, input.groupIds),
});

export const deleteTicketAction = defineAction({
  name: 'ticket.delete', input: ticketRefSchema, permission: 'garden:read', gardenId: (i) => i.gardenId,
  handler: (ctx, input) => service.deleteTicket(ctx, input.ticketId),
});

export const stopSeriesAction = defineAction({
  name: 'ticket.stopSeries', input: seriesRefSchema, permission: 'garden:read', gardenId: (i) => i.gardenId,
  handler: (ctx, input) => service.stopSeries(ctx, input.seriesId),
});

export const toggleChecklistAction = defineAction({
  name: 'ticket.toggleChecklist', input: checklistToggleSchema, permission: 'checklist:toggle', gardenId: (i) => i.gardenId,
  handler: (ctx, input) => service.toggleChecklistItem(ctx, input.itemId, input.done),
});

export const addChecklistAction = defineAction({
  name: 'ticket.addChecklist', input: checklistAddSchema, permission: 'garden:read', gardenId: (i) => i.gardenId,
  handler: (ctx, input) => service.addChecklistItem(ctx, input.ticketId, input.label),
});

export const commentTicketAction = defineAction({
  name: 'ticket.comment', input: commentSchema, permission: 'ticket:comment', gardenId: (i) => i.gardenId,
  handler: (ctx, input) => service.addComment(ctx, input.ticketId, input.body),
});
