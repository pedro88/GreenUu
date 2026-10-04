'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { listOutbox } from '@/lib/client/outbox';

/** Contenu de la page hors-ligne (OFF-06) : pages en cache sur l'appareil et saisies en attente. */
export function OfflinePage() {
  const t = useTranslations('offline');
  const [pages, setPages] = useState<string[] | null>(null);
  const [pending, setPending] = useState(0);
  useEffect(() => {
    void listOutbox().then((items) => setPending(items.filter((i) => i.status === 'pending').length)).catch(() => undefined);
    const sw = navigator.serviceWorker;
    // Sans service worker actif, aucune page n'est en cache : la liste reste vide.
    if (!sw?.controller) return undefined;
    const onMessage = (e: MessageEvent<{ type?: string; urls?: string[] }>) => { if (e.data.type === 'pages') setPages(e.data.urls ?? []); };
    sw.addEventListener('message', onMessage);
    sw.controller.postMessage({ type: 'list-pages' });
    return () => sw.removeEventListener('message', onMessage);
  }, []);
  return (
    <>
      <p data-testid="offline-page-pending" data-count={pending}>{t('pagePending', { count: pending })}</p>
      <h2>{t('pageAvailable')}</h2>
      {!pages || pages.length === 0 ? <p>{t('pageNone')}</p> : (
        // Liens en <a> : une navigation complète, que le service worker sert depuis son cache.
        <ul data-testid="offline-pages">{pages.map((p) => <li key={p}><a href={p}>{p}</a></li>)}</ul>
      )}
      <Button onClick={() => location.reload()} data-testid="offline-retry">{t('pageBack')}</Button>
    </>
  );
}
