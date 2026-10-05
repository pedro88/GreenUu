import { getTranslations } from 'next-intl/server';
import { PageHeader, Stack } from '@/components/ui/Layout';
import { gardenHistory } from '@/features/scene/timelapse';
import { HistoryPlayer } from '@/game/HistoryPlayer';
import { appClock } from '@/server/clock';
import { db } from '@/server/db/client';
import { requireGardenScope } from '@/server/page-guards';

export async function generateMetadata() {
  return { title: (await getTranslations('history'))('title') };
}

/** Histoire du jardin (PAGES.md §4 `/histoire`, SPEC §12.11 TLP) : mêmes droits que la vue jardin (TLP-05). */
export default async function HistoryPage({ params }: PageProps<'/app/jardins/[jardinId]/histoire'>) {
  const { jardinId } = await params;
  const scope = await requireGardenScope(jardinId);
  const t = await getTranslations('history');
  const data = await gardenHistory(db(), scope, appClock().now());
  return (
    <Stack gap="lg">
      <PageHeader title={t('title')} />
      <HistoryPlayer data={data} />
    </Stack>
  );
}
