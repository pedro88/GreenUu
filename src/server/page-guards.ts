import 'server-only';
import { forbidden } from 'next/navigation';
import { cache } from 'react';
import { uuidSchema } from '@/lib/zod';
import { requireUser } from './auth/session';
import { db } from './db/client';
import { loadScope, type Scope } from './authz/scope';

/**
 * Garde des pages `/app/jardins/[jardinId]/**` : adhésion active exigée, sinon page 403
 * sans aucune donnée du jardin (SPEC §5.4, AUTHZ-01).
 */
export const requireGardenScope = cache(async (gardenId: string): Promise<Scope> => {
  const u = await requireUser();
  if (!uuidSchema.safeParse(gardenId).success) forbidden();
  const scope = await loadScope(db(), u.id, gardenId);
  if (!scope) forbidden();
  return scope;
});
