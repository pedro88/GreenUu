import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import styles from './layout.module.scss';

export default async function PublicLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations('public');
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand}>{t('brand')}</Link>
      </header>
      <main className={styles.main} id="contenu">{children}</main>
      <footer className={styles.footer}>
        <Link href="/cgu">{t('terms')}</Link>
        <Link href="/confidentialite">{t('privacy')}</Link>
        <Link href="/cookies">{t('cookies')}</Link>
      </footer>
    </div>
  );
}
