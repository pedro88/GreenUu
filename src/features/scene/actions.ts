'use server';

import { defineAction } from '@/server/action';
import { applyPlanCommands } from './plan';
import { applyPlanSchema } from './plan.schema';

/** §9.7 : lot de commandes de l'éditeur de plan, tout ou rien, avec contrôle de version (`CONFLICT`). */
export const applyPlanCommandsAction = defineAction({
  // Le service vérifie chaque commande : zones via leurs services (restrictions comprises), terrain et échelle via plan:edit.
  name: 'plan.apply', permission: 'garden:read', gardenId: (i) => i.gardenId, input: applyPlanSchema,
  handler: (ctx, input) => applyPlanCommands(ctx, input),
});
