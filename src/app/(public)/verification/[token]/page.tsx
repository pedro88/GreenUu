import { getTranslations } from 'next-intl/server';
import { Narrow, Stack } from '@/components/ui/Layout';
import { VerifyEmail } from '@/features/account/ui/VerifyEmail';

export async function generateMetadata() {
  return { title: (await getTranslations('auth'))('verifyTitle') };
}

export default async function VerifyPage({ params }: PageProps<'/verification/[token]'>) {
  const { token } = await params;
  const t = await getTranslations('auth');
  return (
    <Narrow>
      <Stack>
        <h1>{t('verifyTitle')}</h1>
        <VerifyEmail token={token} />
      </Stack>
    </Narrow>
  );
}
