'use server';

import { defineAction } from '@/server/action';
import { resultSubmitSchema, shareResultsSchema } from './schema';
import { setResultSharing, submitResult } from './service';

/** RG-RES-01 à 04 : `result:submit`, soumis aux restrictions de zone. */
export const submitResultAction = defineAction({
  name: 'result.submit', input: resultSubmitSchema, permission: 'result:submit', gardenId: (i) => i.gardenId,
  handler: (ctx, input) => submitResult(ctx, input),
});

/** §11.2 : partage anonymisé des bilans, décision de l'owner seul (PRV-03). */
export const setResultSharingAction = defineAction({
  name: 'result.setSharing', input: shareResultsSchema, permission: 'garden:share_results', gardenId: (i) => i.gardenId,
  handler: (ctx, input) => setResultSharing(ctx, input.enabled, input.consentVersion),
});
