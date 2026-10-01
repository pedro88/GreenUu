import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { register, requestPasswordReset, resetPassword, signIn } from '../../src/features/account/actions';
import { db } from '../../src/server/db/client';
import { consent, user, userProfile, verification } from '../../src/server/db/schema';
import { cookieJar } from './setup';

/* Ces tests passent par les vraies Server Actions et Better Auth (base de test, données uniques par exécution). */
const run = Date.now().toString(36);
const email = (n: string) => `${n}-${run}@test.local`;
const PASSWORD = 'une-phrase-de-passe-solide';

beforeEach(() => cookieJar.clear());

describe('comptes (Server Actions)', () => {
  it("[AUTH-01] l'inscription crée le compte, le profil et le consentement CGU", async () => {
    const res = await register({ email: email('ines'), password: PASSWORD, pseudo: `ines${run}`.slice(0, 24), acceptTerms: true, timezone: 'Europe/Brussels' });
    expect(res).toEqual({ ok: true, data: { redirectTo: '/bienvenue' } });
    const [u] = await db().select().from(user).where(eq(user.email, email('ines')));
    expect(u?.emailVerified).toBe(false);
    const [p] = await db().select().from(userProfile).where(eq(userProfile.userId, u?.id ?? ''));
    expect(p?.timezone).toBe('Europe/Brussels');
    const consents = await db().select().from(consent).where(eq(consent.userId, u?.id ?? ''));
    expect(consents.map((c) => [c.kind, c.version])).toEqual([['terms', 'cgu-2026-10']]);
  });

  it('[AUTH-02] pseudo déjà pris (casse différente) : erreur de champ, aucun compte créé', async () => {
    const pseudo = `jo${run}`.slice(0, 24);
    await register({ email: email('jo1'), password: PASSWORD, pseudo, acceptTerms: true });
    const res = await register({ email: email('jo2'), password: PASSWORD, pseudo: pseudo.toUpperCase(), acceptTerms: true });
    expect(res).toMatchObject({ ok: false, error: { code: 'VALIDATION', fieldErrors: { pseudo: ['pseudoTaken'] } } });
    expect(await db().select().from(user).where(eq(user.email, email('jo2')))).toEqual([]);
  });

  it('[AUTH-05] e-mail inconnu et mauvais mot de passe : même message générique', async () => {
    await register({ email: email('kim'), password: PASSWORD, pseudo: `kim${run}`.slice(0, 24), acceptTerms: true });
    const unknown = await signIn({ email: email('personne'), password: PASSWORD });
    const wrong = await signIn({ email: email('kim'), password: 'pas-le-bon-mot-de-passe' });
    expect(unknown).toEqual({ ok: false, error: { code: 'VALIDATION', message: 'invalidCredentials' } });
    expect(wrong).toEqual(unknown);
    expect(await signIn({ email: email('kim'), password: PASSWORD })).toEqual({ ok: true, data: { redirectTo: '/app' } });
  });

  it('[AUTH-06] 5 échecs en 15 minutes bloquent la 6e tentative', async () => {
    await register({ email: email('lou'), password: PASSWORD, pseudo: `lou${run}`.slice(0, 24), acceptTerms: true });
    for (let i = 0; i < 5; i++) await signIn({ email: email('lou'), password: 'mauvais-mot-de-passe' });
    expect(await signIn({ email: email('lou'), password: PASSWORD })).toMatchObject({ ok: false, error: { code: 'RATE_LIMITED' } });
  });

  it('[AUTH-08] un lien de réinitialisation expiré est refusé', async () => {
    await register({ email: email('max'), password: PASSWORD, pseudo: `max${run}`.slice(0, 24), acceptTerms: true });
    await requestPasswordReset({ email: email('max') });
    const [u] = await db().select().from(user).where(eq(user.email, email('max')));
    const rows = await db().select().from(verification).where(eq(verification.value, u?.id ?? ''));
    const reset = rows.find((r) => r.identifier.startsWith('reset-password:'));
    if (!reset) throw new Error('aucun jeton de réinitialisation');
    const token = reset.identifier.slice('reset-password:'.length);
    await db().update(verification).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(verification.id, reset.id));
    expect(await resetPassword({ token, password: 'nouvelle-phrase-de-passe' })).toMatchObject({ ok: false, error: { message: 'linkExpired' } });
  });
});
