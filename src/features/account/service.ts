import { and, eq, ne } from 'drizzle-orm';
import { conflict, validation } from '@/lib/errors';
import type { Executor } from '@/server/db/client';
import { consent, userProfile } from '@/server/db/schema';
import { emit } from '@/server/events/emit';
import { TERMS_VERSION } from './schema';

export async function isPseudoTaken(tx: Executor, pseudo: string, exceptUserId?: string): Promise<boolean> {
  const [row] = await tx.select({ id: userProfile.userId }).from(userProfile)
    .where(exceptUserId ? and(eq(userProfile.pseudo, pseudo), ne(userProfile.userId, exceptUserId)) : eq(userProfile.pseudo, pseudo)).limit(1);
  return row !== undefined;
}

/** Profil et consentement aux CGU créés juste après le compte Better Auth (RG-AUTH-01). */
export async function createProfile(tx: Executor, input: { userId: string; pseudo: string; timezone: string; now: Date }) {
  if (await isPseudoTaken(tx, input.pseudo)) throw conflict('pseudoTaken');
  await tx.insert(userProfile).values({ userId: input.userId, pseudo: input.pseudo, timezone: input.timezone });
  await tx.insert(consent).values({ userId: input.userId, kind: 'terms', version: TERMS_VERSION, grantedAt: input.now });
  await emit(tx, { type: 'user.registered', subjectType: 'user', subjectId: input.userId, gardenId: null, actorId: input.userId, payload: {} }, input.now);
}

export async function updateProfile(tx: Executor, userId: string, input: { pseudo: string; timezone: string; locale: 'fr' | 'en' }) {
  if (await isPseudoTaken(tx, input.pseudo, userId)) throw validation({ pseudo: ['pseudoTaken'] });
  await tx.update(userProfile).set(input).where(eq(userProfile.userId, userId));
}
