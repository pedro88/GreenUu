import { getTranslations } from 'next-intl/server';
import { Narrow, Stack } from '@/components/ui/Layout';
import { ResetForm } from '@/features/account/ui/ResetForm';

export async function generateMetadata() {
  return { title: (await getTranslations('auth'))('resetTitle') };
}

export default async function ResetPage({ params }: PageProps<'/reinitialisation/[token]'>) {
  const { token } = await params;
  const t = await getTranslations('auth');
  return (
    <Narrow>
      <Stack>
        <h1>{t('resetTitle')}</h1>
        <ResetForm token={token} />
      </Stack>
    </Narrow>
  );
}
