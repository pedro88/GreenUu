'use client';

import { clearOutbox } from '@/lib/client/outbox';

/**
 * Déconnexion (SPEC §12.10, OFF-08) : plus rien de la session ne reste sur l'appareil. Les pages authentifiées en
 * cache et la file des saisies sont vidées ; seule la page /hors-ligne, publique, est gardée.
 */
export async function clearDeviceData(): Promise<void> {
  const tasks: Promise<unknown>[] = [clearOutbox().catch(() => undefined)];
  if (typeof caches !== 'undefined') {
    tasks.push((async () => {
      for (const name of (await caches.keys()).filter((k) => k.startsWith('greenu-pages-'))) {
        const cache = await caches.open(name);
        for (const req of await cache.keys()) if (new URL(req.url).pathname !== '/hors-ligne') await cache.delete(req);
      }
    })().catch(() => undefined));
  }
  await Promise.all(tasks);
}
