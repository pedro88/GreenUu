import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Card, Muted, PageHeader, Stack } from '@/components/ui/Layout';
import { publicProfile } from '@/features/guide/queries';
import styles from '@/features/guide/ui/Content.module.scss';
import { ReportDialog } from '@/features/moderation/ui/ReportDialog';
import { tipFeed } from '@/features/tip/service';
import { requireUser } from '@/server/auth/session';
import { db } from '@/server/db/client';

export async function generateMetadata({ params }: PageProps<'/app/jardiniers/[pseudo]'>) {
  return { title: (await getTranslations('publicProfile'))('title', { pseudo: decodeURIComponent((await params).pseudo) }) };
}

/** Profil public (PAGES.md §6) : guides et tips publiés ; l'avatar et le niveau arrivent aux lots 6 et 8. */
export default async function GardenerPage({ params }: PageProps<'/app/jardiniers/[pseudo]'>) {
  const u = await requireUser();
  const pseudo = decodeURIComponent((await params).pseudo);
  if (pseudo.length > 40) notFound();
  const p = await publicProfile(db(), u, pseudo);
  if (!p) notFound();
  const t = await getTranslations('publicProfile');
  const tips = await tipFeed(db(), u, { authorId: p.userId }, null, 30);
  return (
    <Stack gap="lg">
      <PageHeader title={t('title', { pseudo: p.pseudo })} actions={p.self ? null : <ReportDialog target={{ kind: 'user', id: p.userId }} label={t('report')} />} />
      <Card>
        <h2>{t('guides')}</h2>
        {p.guides.length === 0 ? <Muted>{t('noGuides')}</Muted> : (
          <ul data-testid="profile-guides">{p.guides.map((g) => <li key={g.id}><Link href={`/app/guides/${g.id}`}>{g.title}</Link></li>)}</ul>
        )}
      </Card>
      <Card>
        <h2>{t('tips')}</h2>
        {tips.length === 0 ? <Muted>{t('noTips')}</Muted> : (
          <ul className={styles.list} data-testid="profile-tips">{tips.map((x) => <li key={x.id} className={styles.item}>{x.body}</li>)}</ul>
        )}
      </Card>
    </Stack>
  );
}
