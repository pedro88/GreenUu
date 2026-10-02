import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import styles from './Content.module.scss';

const TABS = [['plants', '/app/plantes'], ['guides', '/app/guides'], ['tips', '/app/tips']] as const;

/** Sous-navigation de l'onglet « Savoirs » (maquettes guide et tips). */
export async function KnowledgeTabs({ active }: { active: (typeof TABS)[number][0] }) {
  const t = await getTranslations('knowledge');
  return (
    <nav className={styles.tabs} aria-label={t('label')}>
      {TABS.map(([key, href]) => <Link key={key} href={href} aria-current={key === active ? 'page' : undefined} data-testid={`knowledge-${key}`}>{t(key)}</Link>)}
    </nav>
  );
}
