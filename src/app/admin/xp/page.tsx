import { forbidden } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import { Card, Muted, PageHeader, Stack } from '@/components/ui/Layout';
import { openFlags } from '@/features/progression/service';
import { requireUser } from '@/server/auth/session';
import { db } from '@/server/db/client';

export async function generateMetadata() {
  return { title: (await getTranslations('adminXp'))('title') };
}

/** `/admin/xp` (PAGES.md §8) : saisies en masse signalées (RG-XP-07). Le recalcul se lance par `pnpm xp:recompute`. */
export default async function AdminXpPage() {
  const u = await requireUser();
  if (u.platformRole !== 'admin' && u.platformRole !== 'moderator') forbidden();
  const t = await getTranslations('adminXp');
  const f = await getFormatter();
  const flags = await openFlags(db());
  return (
    <Stack gap="lg">
      <PageHeader title={t('title')} subtitle={t('intro')} />
      <Card>
        {flags.length === 0 ? <Muted>{t('empty')}</Muted> : (
          <ul data-testid="xp-flags">{flags.map((x) => <li key={x.id}>{x.pseudo} · {f.dateTime(x.windowStart, { dateStyle: 'medium', timeStyle: 'short' })} · {t('events', { count: x.events })}</li>)}</ul>
        )}
      </Card>
    </Stack>
  );
}
