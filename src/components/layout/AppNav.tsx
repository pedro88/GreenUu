'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { PixelIcon } from '@/components/ui/PlantIcon';
import styles from './AppShell.module.scss';

const ITEMS = [
  { href: '/app', key: 'home', icon: 'nav/accueil', match: (p: string) => p === '/app' },
  { href: '/app/jardins', key: 'gardens', icon: 'nav/jardin', match: (p: string) => p.startsWith('/app/jardins') },
  { href: '/app/taches', key: 'tasks', icon: 'nav/taches', match: (p: string) => p.startsWith('/app/taches') },
  { href: '/app/plantes', key: 'knowledge', icon: 'nav/savoirs', match: (p: string) => ['/app/plantes', '/app/guides', '/app/tips', '/app/jardiniers'].some((x) => p.startsWith(x)) },
  { href: '/app/profil', key: 'profile', icon: 'nav/profil', match: (p: string) => p.startsWith('/app/parametres') || p.startsWith('/app/profil') },
] as const;

/** Barre d'onglets bas (mobile, icônes pixel art) ou navigation d'en-tête (desktop), comme les maquettes. */
export function AppNav({ variant }: { variant: 'top' | 'bottom' }) {
  const t = useTranslations('nav');
  const pathname = usePathname();
  return (
    <nav className={variant === 'top' ? styles.topnav : styles.bottomnav} aria-label={t('label')}>
      {ITEMS.map(({ href, key, icon, match }) => (
        <Link key={href} href={href} aria-current={match(pathname) ? 'page' : undefined} data-testid={`nav-${key}`}>
          {variant === 'bottom' ? <PixelIcon name={icon} size={32} /> : null}
          {t(key)}
        </Link>
      ))}
    </nav>
  );
}
