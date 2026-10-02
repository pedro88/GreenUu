import { getFormatter, getTranslations } from 'next-intl/server';
import { Badge, Muted, PageHeader, Stack } from '@/components/ui/Layout';
import { achievementsOf } from '@/features/progression/achievements';
import styles from '@/features/guide/ui/Content.module.scss';
import { requireUser } from '@/server/auth/session';
import { appClock } from '@/server/clock';
import { db } from '@/server/db/client';

export async function generateMetadata() {
  return { title: (await getTranslations('profile'))('achievementsTitle') };
}

/** Succès (PAGES.md §6, ACH-05) : obtenus et datés ; verrouillés avec leur condition et leur avancement. */
export default async function AchievementsPage() {
  const u = await requireUser();
  const t = await getTranslations('profile');
  const ta = await getTranslations('achievements');
  const tq = await getTranslations('quests');
  const f = await getFormatter();
  const list = await achievementsOf(db(), u.id, appClock().now());
  return (
    <Stack gap="lg">
      <PageHeader title={t('achievementsTitle')} />
      <ul className={styles.list} data-testid="achievements">
        {list.map((a) => (
          <li key={a.code} className={styles.item} data-testid={`achievement-${a.code}`} data-earned={a.earned}>
            <strong>{ta(a.code)}</strong>
            <Muted>{ta(`${a.code}_desc`)}</Muted>
            {a.earnedAt ? <Badge>{t('earnedOn', { date: f.dateTime(a.earnedAt, { dateStyle: 'medium' }) })}</Badge>
              : <span data-testid={`achievement-progress-${a.code}`}>{t('locked')} · {tq('progress', { current: a.current, target: a.target })}</span>}
          </li>
        ))}
      </ul>
    </Stack>
  );
}
