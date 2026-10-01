'use server';

import { defineAction } from '@/server/action';
import { journalCreateSchema, journalRefSchema } from './schema';
import * as service from './service';

export const createJournalEntryAction = defineAction({
  name: 'journal.create',
  input: journalCreateSchema,
  permission: 'journal:create',
  gardenId: (i) => i.gardenId,
  handler: (ctx, input) => service.createJournalEntry(ctx, input),
});

export const deleteJournalEntryAction = defineAction({
  name: 'journal.delete',
  input: journalRefSchema,
  permission: 'garden:read',
  gardenId: (i) => i.gardenId,
  handler: (ctx, input) => service.deleteJournalEntry(ctx, input.entryId),
});

export const resolveProblemAction = defineAction({
  name: 'journal.resolve',
  input: journalRefSchema,
  permission: 'journal:create',
  gardenId: (i) => i.gardenId,
  handler: (ctx, input) => service.resolveProblem(ctx, input.entryId),
});
