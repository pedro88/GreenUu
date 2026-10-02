import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Badge, Card, Muted, PageHeader, Row, Stack } from '@/components/ui/Layout';
import { avatarOf } from '@/features/avatar/service';
import { AvatarThumb } from '@/features/avatar/ui/AvatarThumb';
import { progressOf } from '@/features/progression/service';
import { publicProfile } from '@/features/guide/queries';
import styles from '@/features/guide/ui/Content.module.scss';
import { ReportDialog } from '@/features/moderation/ui/ReportDialog';
import { tipFeed } from '@/features/tip/service';
import { requireUser } from '@/server/auth/session';
import { db } from '@/server/db/client';

export async function generateMetadata({ params }: PageProps<'/app/jardiniers/[pseudo]'>) {
  return { title: (await getTranslations('publicProfile'))('title', { pseudo: decodeURIComponent((await params).pseudo) }) };
}

/** Profil public (PAGES.md §6) : avatar, niveau, guides et tips publiés (selon la visibilité du profil). */
export default async function GardenerPage({ params }: PageProps<'/app/jardiniers/[pseudo]'>) {
  const u = await requireUser();
  const pseudo = decodeURIComponent((await params).pseudo);
  if (pseudo.length > 40) notFound();
  const p = await publicProfile(db(), u, pseudo);
  if (!p) notFound();
  const t = await getTranslations('publicProfile');
  const [tips, avatar, progress] = await Promise.all([tipFeed(db(), u, { authorId: p.userId }, null, 30), avatarOf(db(), p.userId), progressOf(db(), p.userId)]);
  const tp = await getTranslations('profile');
  return (
    <Stack gap="lg">
      <PageHeader title={t('title', { pseudo: p.pseudo })} actions={p.self ? null : <ReportDialog target={{ kind: 'user', id: p.userId }} label={t('report')} />} />
      <Row>
        <AvatarThumb userId={avatar.userId} config={avatar.config} configHash={avatar.configHash} pseudo={p.pseudo} size={96} />
        <Badge data-testid="public-level">{tp('level', { level: progress.level })}</Badge>
      </Row>
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
