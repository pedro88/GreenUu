import { forbidden } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import type { ReactNode } from 'react';
import styles from '@/components/layout/AppShell.module.scss';
import { requireUser } from '@/server/auth/session';

/** Administration et modération (PAGES.md §8) : moderator ou admin plateforme. */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const u = await requireUser();
  if (u.platformRole !== 'moderator' && u.platformRole !== 'admin') forbidden();
  const t = await getTranslations('moderation');
  return (
    <div className={styles.shell}>
      <header className={styles.topbar} style={{ display: 'flex' }}>
        <Link href="/app" className={styles.brand}>{t('brand')}</Link>
        <nav className={styles.topnav} aria-label={t('nav')}>
          <Link href="/admin/varietes">{t('varieties')}</Link>
          <Link href="/admin/signalements" data-testid="admin-reports">{t('reports')}</Link>
        </nav>
      </header>
      <main id="contenu" className={styles.main}>{children}</main>
    </div>
  );
}
