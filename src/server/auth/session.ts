import 'server-only';
import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { db } from '../db/client';
import { user, userProfile } from '../db/schema';
import { auth } from './auth';

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  platformRole: 'user' | 'moderator' | 'admin';
  pseudo: string | null;
  timezone: string;
};

/** Session de la requête courante (mise en cache pour la durée du rendu). */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const s = await auth().api.getSession({ headers: await headers() });
  if (!s) return null;
  const [row] = await db()
    .select({ platformRole: user.platformRole, pseudo: userProfile.pseudo, timezone: userProfile.timezone })
    .from(user)
    .leftJoin(userProfile, eq(userProfile.userId, user.id))
    .where(eq(user.id, s.user.id))
    .limit(1);
  if (!row) return null;
  return {
    id: s.user.id,
    email: s.user.email,
    name: s.user.name,
    emailVerified: s.user.emailVerified,
    platformRole: row.platformRole,
    pseudo: row.pseudo,
    timezone: row.timezone ?? 'Europe/Paris',
  };
});

/** Exige une session ; sinon redirige vers la connexion en conservant la page demandée. */
export async function requireUser(): Promise<SessionUser> {
  const u = await getSessionUser();
  if (!u) {
    const next = (await headers()).get('x-pathname') ?? '/app';
    redirect(`/connexion?next=${encodeURIComponent(next)}`);
  }
  return u;
}
