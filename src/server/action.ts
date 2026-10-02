import 'server-only';
import { revalidatePath } from 'next/cache';
import type { z } from 'zod';
import type { ActionResult } from '@/lib/errors';
import { actionRegistry, runAction, shouldRevalidate, type ActionDefinition, type Actor } from './action-core';
import { getSessionUser } from './auth/session';
import { appClock } from './clock';
import { db } from './db/client';
import { env } from './env';
import { transactionalQueue } from './jobs/boss';

export async function currentActor(): Promise<Actor | null> {
  const u = await getSessionUser();
  if (!u) return null;
  return { id: u.id, email: u.email, name: u.name, emailVerified: u.emailVerified, platformRole: u.platformRole, timezone: u.timezone };
}

/**
 * Construit une Server Action à partir d'une définition (SPEC §3.4).
 * À appeler dans un fichier `'use server'` : `export const createGarden = defineAction({...})`.
 */
export function defineAction<S extends z.ZodType, R>(def: ActionDefinition<S, R>) {
  // as: le registre est hétérogène ; il ne sert qu'aux tests d'autorisation qui passent des entrées brutes.
  actionRegistry.set(def.name, def as unknown as ActionDefinition<z.ZodType, unknown>);
  return async (raw: z.input<S>): Promise<ActionResult<R>> => {
    const result = await runAction(def, await currentActor(), raw, {
      db: db(),
      clock: appClock(),
      appUrl: env().APP_URL,
      jobs: transactionalQueue,
    });
    // Toutes les pages connectées sont dynamiques : on rafraîchit l'arbre /app après une mutation réussie.
    if (shouldRevalidate(def, result.ok)) revalidatePath('/app', 'layout');
    return result;
  };
}
