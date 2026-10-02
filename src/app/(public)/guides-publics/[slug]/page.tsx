import { notFound } from 'next/navigation';
import { cache } from 'react';
import { getFormatter, getTranslations } from 'next-intl/server';
import { LinkButton } from '@/components/ui/Button';
import { Card, Stack } from '@/components/ui/Layout';
import { Markdown } from '@/components/ui/Markdown';
import { publicGuideBySlug } from '@/features/guide/queries';
import styles from '@/features/guide/ui/Content.module.scss';
import { tDynamic } from '@/i18n/dynamic';
import { DomainError } from '@/lib/errors';
import { db } from '@/server/db/client';

/** Partagé par generateMetadata et la page : une seule lecture par requête (audit lot 4, M3). */
const load = cache(async (slug: string) => {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) notFound();
  return publicGuideBySlug(db(), slug).catch((e: unknown) => {
    if (e instanceof DomainError && e.code === 'NOT_FOUND') notFound();
    throw e;
  });
});

export async function generateMetadata({ params }: PageProps<'/guides-publics/[slug]'>) {
  const d = await load((await params).slug);
  // Non listé : accessible par le lien, jamais indexé (RG-GUI-03).
  return { title: d.version?.title ?? '', robots: d.guide.visibility === 'public' ? undefined : { index: false, follow: false } };
}

/** Guide public ou non listé, sans compte (GUI-01) ; le Markdown est assaini. */
export default async function PublicGuidePage({ params }: PageProps<'/guides-publics/[slug]'>) {
  const d = await load((await params).slug);
  const t = await getTranslations('guides');
  const te = await getTranslations('environments');
  const f = await getFormatter();
  const v = d.version;
  if (!v) notFound();
  return (
    <Stack gap="lg">
      <Card>
        <Stack gap="sm">
          <h1 data-testid="guide-title">{v.title}</h1>
          <p className={styles.meta}>
            {t('byAuthor', { pseudo: d.authorPseudo })} · {d.speciesName} · {t('versionShort', { number: v.number })} · {t('updatedOn', { date: f.dateTime(v.publishedAt, { dateStyle: 'medium' }) })}
          </p>
          <ul className={styles.chips}>
            {(v.context.koppen ?? []).map((k) => <li key={k} className={styles.chip}>{k}</li>)}
            {(v.context.environments ?? []).map((e) => <li key={e} className={styles.chip}>{tDynamic(te, e, e)}</li>)}
          </ul>
        </Stack>
      </Card>
      <Card><Markdown>{v.bodyMd}</Markdown></Card>
      <LinkButton href={`/inscription?next=${encodeURIComponent(`/app/guides/${d.guide.id}`)}`} size="large">{t('joinCta')}</LinkButton>
    </Stack>
  );
}
