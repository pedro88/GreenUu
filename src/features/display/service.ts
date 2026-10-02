import { eq } from 'drizzle-orm';
import type { DefaultView } from '@/lib/enums';
import type { Executor } from '@/server/db/client';
import { userProfile } from '@/server/db/schema';

/* Affichage et accessibilité (PAGES.md §7 `/affichage`) : vue par défaut d'un jardin, animations réduites. */

export async function displayPrefsOf(tx: Executor, userId: string): Promise<{ defaultView: DefaultView; reducedMotion: boolean }> {
  const [p] = await tx.select({ defaultView: userProfile.defaultView, reducedMotion: userProfile.reducedMotion }).from(userProfile).where(eq(userProfile.userId, userId)).limit(1);
  return { defaultView: p?.defaultView ?? 'garden', reducedMotion: p?.reducedMotion ?? false };
}

export async function setDisplayPrefs(tx: Executor, userId: string, prefs: { defaultView?: DefaultView | undefined; reducedMotion?: boolean | undefined }) {
  const set = { ...(prefs.defaultView ? { defaultView: prefs.defaultView } : {}), ...(prefs.reducedMotion === undefined ? {} : { reducedMotion: prefs.reducedMotion }) };
  if (Object.keys(set).length) await tx.update(userProfile).set(set).where(eq(userProfile.userId, userId));
  return displayPrefsOf(tx, userId);
}
