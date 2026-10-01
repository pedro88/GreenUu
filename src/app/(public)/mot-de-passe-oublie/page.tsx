import { getTranslations } from 'next-intl/server';
import { Muted, Narrow, Stack } from '@/components/ui/Layout';
import { ForgotForm } from '@/features/account/ui/ForgotForm';

export async function generateMetadata() {
  return { title: (await getTranslations('auth'))('forgotTitle') };
}

export default async function ForgotPage() {
  const t = await getTranslations('auth');
  return (
    <Narrow>
      <Stack>
        <h1>{t('forgotTitle')}</h1>
        <Muted>{t('forgotIntro')}</Muted>
        <ForgotForm />
      </Stack>
    </Narrow>
  );
}
