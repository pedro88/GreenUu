import { Sprout } from 'lucide-react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { LinkButton } from '@/components/ui/Button';
import styles from './layout.module.scss';

export default async function PublicLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations('public');
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand}><Sprout aria-hidden />{t('brand')}</Link>
        <nav className={styles.nav} aria-label={t('nav')}>
          <Link href="/guides-publics">{t('guides')}</Link>
          <Link href="/connexion">{t('signIn')}</Link>
          <LinkButton href="/inscription" className={styles.cta}>{t('signUp')}</LinkButton>
        </nav>
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
