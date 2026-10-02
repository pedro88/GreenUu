import { getTranslations } from 'next-intl/server';
import { Badge, Muted, PageHeader, Stack } from '@/components/ui/Layout';
import styles from '@/features/guide/ui/Content.module.scss';
import { generateQuests, questsOf } from '@/features/progression/quests';
import { tDynamic } from '@/i18n/dynamic';
import { requireUser } from '@/server/auth/session';
import { appClock } from '@/server/clock';
import { db } from '@/server/db/client';

export async function generateMetadata() {
  return { title: (await getTranslations('profile'))('questsTitle') };
}

/** Quêtes (PAGES.md §6, §8.6) : générées à la demande (idempotent), toujours adossées à une tâche réelle. */
export default async function QuestsPage() {
  const u = await requireUser();
  const t = await getTranslations('profile');
  const tq = await getTranslations('quests');
  await db().transaction((tx) => generateQuests(tx, u.id, appClock().now()));
  const list = await questsOf(db(), u.id);
  return (
    <Stack gap="lg">
      <PageHeader title={t('questsTitle')} />
      {list.length === 0 ? <Muted>{tq('empty')}</Muted> : (
        <ul className={styles.list} data-testid="quests">
          {list.map((q) => (
            <li key={q.id} className={styles.item}>
              <Badge>{tq(`kind_${q.kind}`)}</Badge>
              <strong>{tDynamic(tq, q.titleKey, q.titleKey, q.titleParams)}</strong>
              {q.target > 1 ? <Muted>{tq('progress', { current: q.progress, target: q.target })}</Muted> : null}
            </li>
          ))}
        </ul>
      )}
    </Stack>
  );
}
