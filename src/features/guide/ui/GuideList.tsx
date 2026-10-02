import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import { Badge, Muted } from '@/components/ui/Layout';
import { tDynamic } from '@/i18n/dynamic';
import type { GuideContextV1 } from '@/lib/content-types';
import styles from './Content.module.scss';

type Row = {
  id: string; slug: string; title: string | null; number: number | null; publishedAt: Date | null; speciesName: string; authorPseudo: string | null;
  visibility: 'private' | 'unlisted' | 'public'; context: GuideContextV1 | null; published?: boolean;
};

/** Cartes de guides ; `hrefOf` choisit la route (connectée ou publique). */
export async function GuideList({ rows, hrefOf }: { rows: Row[]; hrefOf: (r: Row) => string }) {
  const t = await getTranslations('guides');
  const tv = await getTranslations('guideVisibility');
  const te = await getTranslations('environments');
  const f = await getFormatter();
  if (rows.length === 0) return <Muted>{t('empty')}</Muted>;
  return (
    <ul className={styles.list} data-testid="guide-list">
      {rows.map((r) => (
        <li key={r.id} className={styles.item}>
          <h2 className={styles.itemTitle}><Link href={hrefOf(r)}>{r.title}</Link></h2>
          <p className={styles.meta}>
            {r.speciesName} · {t('byAuthor', { pseudo: r.authorPseudo ?? '' })}
            {r.number !== null ? ` · ${t('versionShort', { number: r.number })}` : ''}
            {r.publishedAt ? ` · ${t('updatedOn', { date: f.dateTime(r.publishedAt, { dateStyle: 'medium' }) })}` : ''}
          </p>
          <ul className={styles.chips}>
            {r.published === false ? <li><Badge>{t('draft')}</Badge></li> : null}
            {r.visibility !== 'public' ? <li><Badge>{tv(r.visibility)}</Badge></li> : null}
            {(r.context?.koppen ?? []).map((k) => <li key={k} className={styles.chip}>{k}</li>)}
            {(r.context?.environments ?? []).map((e) => <li key={e} className={styles.chip}>{tDynamic(te, e, e)}</li>)}
          </ul>
        </li>
      ))}
    </ul>
  );
}
