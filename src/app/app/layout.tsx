import { Sprout } from 'lucide-react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { AppNav } from '@/components/layout/AppNav';
import styles from '@/components/layout/AppShell.module.scss';
import { requireUser } from '@/server/auth/session';

export default async function AppLayout({ children }: { children: ReactNode }) {
  await requireUser();
  const t = await getTranslations('nav');
  return (
    <div className={styles.shell}>
      <a href="#contenu" className={styles.skip}>{t('skip')}</a>
      <header className={styles.topbar}>
        <Link href="/app" className={styles.brand}><Sprout aria-hidden />{t('brand')}</Link>
        <AppNav variant="top" />
      </header>
      <main id="contenu" className={styles.main}>{children}</main>
      <AppNav variant="bottom" />
    </div>
  );
}
