'use client';

import { BookOpen, ClipboardList, Home, Sprout, UserRound } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import styles from './AppShell.module.scss';

const ITEMS = [
  { href: '/app', key: 'home', icon: Home, match: (p: string) => p === '/app' },
  { href: '/app/jardins', key: 'gardens', icon: Sprout, match: (p: string) => p.startsWith('/app/jardins') },
  { href: '/app/taches', key: 'tasks', icon: ClipboardList, match: (p: string) => p.startsWith('/app/taches') },
  { href: '/app/plantes', key: 'knowledge', icon: BookOpen, match: (p: string) => ['/app/plantes', '/app/guides', '/app/tips', '/app/jardiniers'].some((x) => p.startsWith(x)) },
  { href: '/app/profil', key: 'profile', icon: UserRound, match: (p: string) => p.startsWith('/app/parametres') || p.startsWith('/app/profil') },
] as const;

/** Barre d'onglets bas (mobile) ou navigation d'en-tête (desktop), comme les maquettes. */
export function AppNav({ variant }: { variant: 'top' | 'bottom' }) {
  const t = useTranslations('nav');
  const pathname = usePathname();
  return (
    <nav className={variant === 'top' ? styles.topnav : styles.bottomnav} aria-label={t('label')}>
      {ITEMS.map(({ href, key, icon: Icon, match }) => (
        <Link key={href} href={href} aria-current={match(pathname) ? 'page' : undefined} data-testid={`nav-${key}`}>
          {variant === 'bottom' ? <Icon aria-hidden size={24} /> : null}
          {t(key)}
        </Link>
      ))}
    </nav>
  );
}
