'use client';

import { CloudOff } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { tDynamic } from '@/i18n/dynamic';
import { listOutbox, onOutboxChange, removeFromOutbox, retry, type OutboxItem } from '@/lib/client/outbox';
import { replayOutbox } from '../replay';
import styles from './OfflineSync.module.scss';

const RETRY_MS = 30_000;

/**
 * Enregistre le service worker et lui confie la page courante et ses ressources (OFF-01) : celles déjà chargées, puis
 * celles chargées ensuite (chunks à la demande, atlas de la vue jardin), observées et envoyées par lots.
 */
function useServiceWorker() {
  const pathname = usePathname();
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined;
    let reg: ServiceWorkerRegistration | null = null;
    let batch: string[] = [];
    let timer = 0;
    const send = (urls: string[]) => reg?.active?.postMessage({ type: 'warm', page: location.href, urls: [location.href, ...urls] });
    const observer = typeof PerformanceObserver === 'undefined' ? null : new PerformanceObserver((list) => {
      batch.push(...list.getEntries().map((e) => e.name));
      window.clearTimeout(timer);
      timer = window.setTimeout(() => { send(batch); batch = []; }, 1000);
    });
    void navigator.serviceWorker.register('/sw.js').then(() => navigator.serviceWorker.ready).then((r) => {
      reg = r;
      send(performance.getEntriesByType('resource').map((e) => e.name));
      observer?.observe({ type: 'resource' });
    }).catch(() => undefined);
    return () => { observer?.disconnect(); window.clearTimeout(timer); };
  }, [pathname]);
}

/**
 * Hors-ligne (SPEC §12.10, OFF-02, OFF-05) : compteur des saisies en attente, rejeu au retour du réseau, et liste des
 * saisies refusées « à revoir », à réessayer ou abandonner. Jamais de perte silencieuse.
 */
export function OfflineSync() {
  const t = useTranslations('offline');
  const te = useTranslations('errors');
  const [items, setItems] = useState<OutboxItem[]>([]);
  const [online, setOnline] = useState(true);
  const [open, setOpen] = useState(false);
  useServiceWorker();

  useEffect(() => {
    const refresh = () => { void listOutbox().then(setItems).catch(() => setItems([])); };
    const flush = () => { if (navigator.onLine) void replayOutbox().finally(refresh); };
    const net = () => { setOnline(navigator.onLine); flush(); };
    net();
    window.addEventListener('online', net);
    window.addEventListener('offline', net);
    const off = onOutboxChange(refresh);
    const timer = window.setInterval(flush, RETRY_MS);
    return () => { window.removeEventListener('online', net); window.removeEventListener('offline', net); off(); window.clearInterval(timer); };
  }, []);

  const pending = items.filter((i) => i.status === 'pending').length;
  const rejected = items.filter((i) => i.status === 'rejected');
  if (online && items.length === 0) return null;
  return (
    <div className={styles.root}>
      <button type="button" className={styles.badge} aria-expanded={open} onClick={() => setOpen((o) => !o)} data-testid="offline-badge" data-online={online ? 'true' : 'false'}>
        {online ? null : <CloudOff aria-hidden size={16} />}
        <span>{online ? '' : `${t('offline')} · `}</span>
        <span data-testid="offline-pending" data-count={pending}>{t('pending', { count: pending })}</span>
        {rejected.length ? <span className={styles.review} data-testid="offline-rejected" data-count={rejected.length}> · {t('toReview', { count: rejected.length })}</span> : null}
      </button>
      {open ? (
        <div className={styles.panel} role="region" aria-label={t('panel')} data-testid="offline-panel">
          {items.length === 0 ? <p>{t('empty')}</p> : (
            <ul>
              {items.map((i) => (
                <li key={i.id} data-testid={`outbox-${i.id}`} data-status={i.status}>
                  <strong>{i.label}</strong>
                  <span className={styles.muted}>{i.status === 'pending' ? t('waiting') : tDynamic(te, i.error ?? 'internal', te('internal'))}</span>
                  {i.status === 'rejected' ? (
                    <span className={styles.actions}>
                      <Button variant="secondary" onClick={() => void retry(i).then(() => replayOutbox())} data-testid={`outbox-retry-${i.id}`}>{t('retry')}</Button>
                      <Button variant="ghost" onClick={() => void removeFromOutbox(i.id)} data-testid={`outbox-discard-${i.id}`}>{t('discard')}</Button>
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
