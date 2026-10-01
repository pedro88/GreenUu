import { getTranslations } from 'next-intl/server';
import { Narrow, Stack } from '@/components/ui/Layout';
import { RegisterForm } from '@/features/account/ui/RegisterForm';

export async function generateMetadata() {
  return { title: (await getTranslations('auth'))('signUpTitle') };
}

export default async function RegisterPage() {
  const t = await getTranslations('auth');
  return (
    <Narrow>
      <Stack>
        <h1>{t('signUpTitle')}</h1>
        <RegisterForm />
      </Stack>
    </Narrow>
  );
}
