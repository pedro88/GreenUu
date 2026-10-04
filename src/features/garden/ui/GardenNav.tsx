'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import styles from './GardenHeader.module.scss';

export function GardenNav({ gardenId, showSettings }: { gardenId: string; showSettings: boolean }) {
  const t = useTranslations('gardenNav');
  const pathname = usePathname();
  const base = `/app/jardins/${gardenId}`;
  const items: { href: string; key: 'overview' | 'zones' | 'cultures' | 'tickets' | 'seasons' | 'stats' | 'reco' | 'members' | 'progression' | 'settings'; exact: boolean }[] = [
    { href: base, key: 'overview', exact: true },
    { href: `${base}/cultures`, key: 'cultures', exact: false },
    { href: `${base}/tickets`, key: 'tickets', exact: false },
    { href: `${base}/zones`, key: 'zones', exact: false },
    { href: `${base}/saisons`, key: 'seasons', exact: false },
    { href: `${base}/statistiques`, key: 'stats', exact: false },
    { href: `${base}/recommandations`, key: 'reco', exact: false },
    { href: `${base}/membres`, key: 'members', exact: false },
    { href: `${base}/progression`, key: 'progression', exact: false },
    ...(showSettings ? [{ href: `${base}/parametres`, key: 'settings' as const, exact: false }] : []),
  ];
  return (
    <nav className={styles.tabs} aria-label={t('label')}>
      {items.map((i) => {
        const active = i.exact ? pathname === i.href : pathname.startsWith(i.href);
        return <Link key={i.href} href={i.href} aria-current={active ? 'page' : undefined}>{t(i.key)}</Link>;
      })}
    </nav>
  );
}
