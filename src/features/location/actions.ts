'use server';

import { z } from 'zod';
import { defineAction } from '@/server/action';
import { searchCommunes } from './service';

/** LOC-01 à 03 : recherche de communes pour l'assistant de jardin ; session requise, lecture seule. */
export const searchCommunesAction = defineAction({
  name: 'commune.search', readOnly: true, input: z.object({ q: z.string().max(60) }),
  handler: (ctx, input) => searchCommunes(ctx.tx, input.q),
});
