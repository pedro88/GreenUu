import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { db } from '../db/client';
import { account, rateLimit, session, user, verification } from '../db/schema';
import { env } from '../env';
import { sendMailNow } from '../mail/transport';
import { resetPasswordMail, verifyEmailMail } from '../mail/templates';

import { PASSWORD_MIN_LENGTH } from './constants';

function createAuth() {
  const e = env();
  return betterAuth({
    baseURL: e.APP_URL,
    secret: e.BETTER_AUTH_SECRET,
    trustedOrigins: [e.APP_URL],
    database: drizzleAdapter(db(), {
      provider: 'pg',
      schema: { user, session, account, verification, rateLimit },
    }),
    advanced: {
      // Better Auth n'envoie pas d'id : PostgreSQL génère uuidv7() (SPEC §4.1).
      database: { generateId: 'uuid' },
    },
    user: {
      additionalFields: {
        platformRole: { type: 'string', required: false, defaultValue: 'user', input: false },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30, // RG-AUTH-05 : 30 jours
      updateAge: 60 * 60 * 24, // prolongation glissante quotidienne
    },
    emailAndPassword: {
      enabled: true,
      // RG-AUTH-02 : la connexion est permise sans vérification ; les actions sensibles l'exigent.
      requireEmailVerification: false,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: 128,
      autoSignIn: true,
      resetPasswordTokenExpiresIn: 60 * 60, // RG-AUTH-04
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user: u, token }) => {
        await sendMailNow(resetPasswordMail({ to: u.email, url: `${e.APP_URL}/reinitialisation/${token}` }));
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      expiresIn: 60 * 60 * 24 * 3,
      sendVerificationEmail: async ({ user: u, token }) => {
        await sendMailNow(verifyEmailMail({ to: u.email, name: u.name, url: `${e.APP_URL}/verification/${token}` }));
      },
    },
    // La limitation par e-mail (RG-AUTH-03) est faite dans nos Server Actions ; celle-ci protège l'API HTTP brute.
    rateLimit: { enabled: e.NODE_ENV === 'production', storage: 'database', window: 60, max: 30 },
    plugins: [nextCookies()],
  });
}

type Auth = ReturnType<typeof createAuth>;
let instance: Auth | undefined;

export function auth(): Auth {
  instance ??= createAuth();
  return instance;
}
