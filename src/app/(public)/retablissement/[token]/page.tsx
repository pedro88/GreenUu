import { getTranslations } from 'next-intl/server';
import { Narrow, Stack } from '@/components/ui/Layout';
import { RestoreForm } from '@/features/privacy/ui/PrivacyControls';

export async function generateMetadata() {
  return { title: (await getTranslations('restore'))('title'), robots: { index: false } };
}

/** PRV-09 : rétablissement du compte dans le délai de grâce, sur confirmation (le GET ne modifie rien). */
export default async function RestorePage({ params }: PageProps<'/retablissement/[token]'>) {
  const { token } = await params;
  const t = await getTranslations('restore');
  return (
    <Narrow>
      <Stack>
        <h1>{t('title')}</h1>
        <RestoreForm token={decodeURIComponent(token)} />
      </Stack>
    </Narrow>
  );
}
