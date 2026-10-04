import { getLocale, getTranslations } from 'next-intl/server';
import { Badge, Muted, PageHeader, Stack } from '@/components/ui/Layout';
import styles from '@/features/guide/ui/Content.module.scss';
import { questsOf } from '@/features/progression/quests';
import { questTitleParams } from '@/features/progression/quests.pure';
import { ticketTitle } from '@/features/ticket/ui/ticketText';
import { tDynamic } from '@/i18n/dynamic';
import { requireUser } from '@/server/auth/session';
import { db } from '@/server/db/client';

export async function generateMetadata() {
  return { title: (await getTranslations('profile'))('questsTitle') };
}

/**
 * Quêtes (PAGES.md §6, §8.6) : lecture seule (POL-06), la génération passe par le job `quests.generate` ; titres
 * recomposés dans la langue de l'interface (POL-05).
 */
export default async function QuestsPage() {
  const u = await requireUser();
  const t = await getTranslations('profile');
  const tq = await getTranslations('quests');
  const list = await questsOf(db(), u.id);
  const locale = (await getLocale()) === 'en' ? 'en' : 'fr';
  const tAll = await getTranslations();
  return (
    <Stack gap="lg">
      <PageHeader title={t('questsTitle')} />
      {list.length === 0 ? <Muted>{tq('empty')}</Muted> : (
        <ul className={styles.list} data-testid="quests">
          {list.map((q) => (
            <li key={q.id} className={styles.item}>
              <Badge>{tq(`kind_${q.kind}`)}</Badge>
              <strong>{tDynamic(tq, q.titleKey, q.titleKey, questTitleParams(q, locale, (tk) => ticketTitle(tAll, tk)))}</strong>
              {q.target > 1 ? <Muted>{tq('progress', { current: q.progress, target: q.target })}</Muted> : null}
            </li>
          ))}
        </ul>
      )}
    </Stack>
  );
}
