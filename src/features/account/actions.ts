'use server';

import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { APIError } from 'better-auth/api';
import type { ActionResult } from '@/lib/errors';
import { zodFieldErrors } from '@/server/action-core';
import { currentActor, defineAction } from '@/server/action';
import { auth } from '@/server/auth/auth';
import { hit, isLimited, loginLimit, reset, resetLimit } from '@/server/auth/rate-limit';
import { appClock } from '@/server/clock';
import { db } from '@/server/db/client';
import { user } from '@/server/db/schema';
import { env } from '@/server/env';
import { transactionalQueue } from '@/server/jobs/boss';
import { acceptInvitation, previewInvitation } from '../member/service';
import { accountUpdateSchema, forgotSchema, registerSchema, resetSchema, safeNext, signInSchema, verifySchema } from './schema';
import { createProfile, isPseudoTaken, updateProfile } from './service';

const fail = (code: 'VALIDATION' | 'CONFLICT' | 'FORBIDDEN' | 'RATE_LIMITED' | 'NOT_FOUND' | 'INTERNAL', message: string, fieldErrors?: Record<string, string[]>): { ok: false; error: { code: typeof code; message: string; fieldErrors?: Record<string, string[]> } } =>
  ({ ok: false, error: { code, message, ...(fieldErrors ? { fieldErrors } : {}) } });

/** AUTH-01 / INV-02 : inscription (+ acceptation d'invitation si un jeton est fourni). */
export async function register(raw: unknown): Promise<ActionResult<{ redirectTo: string }>> {
  const parsed = registerSchema.safeParse(raw);
  if (!parsed.success) return fail('VALIDATION', 'validation', zodFieldErrors(parsed.error));
  const input = parsed.data;
  const clock = appClock();
  if (await isPseudoTaken(db(), input.pseudo)) return fail('VALIDATION', 'validation', { pseudo: ['pseudoTaken'] });
  if (input.invitationToken) {
    const preview = await previewInvitation(db(), input.invitationToken, clock.now());
    if (preview.status !== 'valid') return fail('NOT_FOUND', 'invitationInvalid');
    if (preview.email.toLowerCase() !== input.email) return fail('FORBIDDEN', 'invitationOtherEmail');
  }
  let userId: string;
  try {
    const res = await auth().api.signUpEmail({ body: { name: input.pseudo, email: input.email, password: input.password }, headers: await headers() });
    userId = res.user.id;
  } catch (err) {
    if (err instanceof APIError && err.status === 'UNPROCESSABLE_ENTITY') return fail('VALIDATION', 'validation', { email: ['emailTaken'] });
    console.error('[register]', err);
    return fail('INTERNAL', 'internal');
  }
  try {
    const redirectTo = await db().transaction(async (tx) => {
      await createProfile(tx, { userId, pseudo: input.pseudo, timezone: input.timezone, now: clock.now() });
      if (!input.invitationToken) return '/bienvenue';
      const actor = { id: userId, email: input.email, name: input.pseudo, emailVerified: false, platformRole: 'user' as const, timezone: input.timezone };
      const { gardenId } = await acceptInvitation({ tx, clock, actor, jobs: transactionalQueue(tx), appUrl: env().APP_URL }, input.invitationToken);
      return `/app/jardins/${gardenId}`;
    });
    return { ok: true, data: { redirectTo } };
  } catch (err) {
    // Le compte Better Auth existe mais le profil a échoué : on l'annule pour permettre une nouvelle tentative.
    await db().delete(user).where(eq(user.id, userId));
    console.error('[register:profile]', err);
    return fail('CONFLICT', 'conflict', { pseudo: ['pseudoTaken'] });
  }
}

/** AUTH-05 / 06 : connexion, message générique, 5 échecs par e-mail et par 15 min. */
export async function signIn(raw: unknown): Promise<ActionResult<{ redirectTo: string }>> {
  const parsed = signInSchema.safeParse(raw);
  if (!parsed.success) return fail('VALIDATION', 'invalidCredentials');
  const { email, password, next } = parsed.data;
  const nowMs = appClock().now().getTime();
  const limit = loginLimit(email);
  if (await isLimited(db(), limit, nowMs)) return fail('RATE_LIMITED', 'tooManyAttempts');
  try {
    await auth().api.signInEmail({ body: { email, password }, headers: await headers() });
  } catch (err) {
    if (err instanceof APIError) {
      await hit(db(), limit, nowMs);
      return fail('VALIDATION', 'invalidCredentials');
    }
    console.error('[signIn]', err);
    return fail('INTERNAL', 'internal');
  }
  await reset(db(), limit.key);
  return { ok: true, data: { redirectTo: safeNext(next) } };
}

export async function signOut(): Promise<ActionResult<null>> {
  await auth().api.signOut({ headers: await headers() });
  return { ok: true, data: null };
}

/** RG-AUTH-03 / 04 : réponse identique que le compte existe ou non. */
export async function requestPasswordReset(raw: unknown): Promise<ActionResult<null>> {
  const parsed = forgotSchema.safeParse(raw);
  if (!parsed.success) return fail('VALIDATION', 'validation', zodFieldErrors(parsed.error));
  const nowMs = appClock().now().getTime();
  const limit = resetLimit(parsed.data.email);
  if (await isLimited(db(), limit, nowMs)) return { ok: true, data: null };
  await hit(db(), limit, nowMs);
  await auth().api.requestPasswordReset({ body: { email: parsed.data.email }, headers: await headers() });
  return { ok: true, data: null };
}

/** AUTH-07 / 08 : nouveau mot de passe, autres sessions révoquées, puis connexion. */
export async function resetPassword(raw: unknown): Promise<ActionResult<{ redirectTo: string }>> {
  const parsed = resetSchema.safeParse(raw);
  if (!parsed.success) return fail('VALIDATION', 'validation', zodFieldErrors(parsed.error));
  const { token, password } = parsed.data;
  const ctx = await auth().$context;
  const verification = await ctx.internalAdapter.findVerificationValue(`reset-password:${token}`);
  // L'expiration est posée par Better Auth avec l'heure système : on la compare à la même horloge, pas à `appClock`
  // (qui peut être figée en test) — un jeton, une seule source de « maintenant ».
  if (!verification || verification.expiresAt.getTime() < Date.now()) return fail('NOT_FOUND', 'linkExpired');
  const [u] = await db().select({ email: user.email }).from(user).where(eq(user.id, verification.value)).limit(1);
  if (!u) return fail('NOT_FOUND', 'linkExpired');
  try {
    await auth().api.resetPassword({ body: { newPassword: password, token }, headers: await headers() });
    await auth().api.signInEmail({ body: { email: u.email, password }, headers: await headers() });
  } catch (err) {
    if (err instanceof APIError) return fail('NOT_FOUND', 'linkExpired');
    throw err;
  }
  return { ok: true, data: { redirectTo: '/app' } };
}

/** AUTH-04 : confirmation de l'adresse ; un second usage est signalé comme déjà utilisé. */
export async function verifyEmail(raw: unknown): Promise<ActionResult<{ status: 'verified' | 'alreadyUsed' }>> {
  const parsed = verifySchema.safeParse(raw);
  if (!parsed.success) return fail('NOT_FOUND', 'linkInvalid');
  // Better Auth renvoie toujours `user: null` : on regarde si l'adresse était déjà vérifiée avant l'appel.
  const email = emailFromVerificationToken(parsed.data.token);
  const [before] = email ? await db().select({ verified: user.emailVerified }).from(user).where(eq(user.email, email)).limit(1) : [];
  try {
    await auth().api.verifyEmail({ query: { token: parsed.data.token }, headers: await headers() });
    revalidatePath('/', 'layout');
    return { ok: true, data: { status: before?.verified ? 'alreadyUsed' : 'verified' } };
  } catch (err) {
    if (err instanceof APIError) return fail('NOT_FOUND', err.message.includes('expired') ? 'linkExpired' : 'linkInvalid');
    throw err;
  }
}

/** Lit (sans le vérifier : Better Auth s'en charge) l'e-mail du jeton JWT de vérification. */
function emailFromVerificationToken(token: string): string | null {
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const parsedPayload: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return typeof parsedPayload === 'object' && parsedPayload !== null && 'email' in parsedPayload && typeof parsedPayload.email === 'string' ? parsedPayload.email : null;
  } catch {
    return null;
  }
}

export async function resendVerification(): Promise<ActionResult<null>> {
  const actor = await currentActor();
  if (!actor) return { ok: false, error: { code: 'UNAUTHENTICATED', message: 'unauthenticated' } };
  if (actor.emailVerified) return { ok: true, data: null };
  await auth().api.sendVerificationEmail({ body: { email: actor.email }, headers: await headers() });
  return { ok: true, data: null };
}

export const updateAccount = defineAction({
  name: 'account.update',
  input: accountUpdateSchema,
  handler: async ({ tx, actor }, input) => {
    await updateProfile(tx, actor.id, input);
    return null;
  },
});

/** Acceptation d'une invitation par un utilisateur déjà connecté (INV-02, INV-03). */
export const acceptInvitationAction = defineAction({
  name: 'invitation.accept',
  input: verifySchema,
  handler: (ctx, input) => acceptInvitation(ctx, input.token),
});
