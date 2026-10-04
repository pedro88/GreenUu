import { getTranslations } from 'next-intl/server';
import { Narrow, Stack } from '@/components/ui/Layout';
import { OfflinePage } from '@/features/offline/ui/OfflinePage';

export async function generateMetadata() {
  return { title: (await getTranslations('offline'))('pageTitle') };
}

/** Page hors-ligne (PAGES.md §9, OFF-06) : servie par le service worker quand une page n'est pas en cache. */
export default async function OfflineRoute() {
  const t = await getTranslations('offline');
  return (
    <Narrow>
      <Stack>
        <h1>{t('pageTitle')}</h1>
        <p>{t('pageIntro')}</p>
        <OfflinePage />
      </Stack>
    </Narrow>
  );
}
