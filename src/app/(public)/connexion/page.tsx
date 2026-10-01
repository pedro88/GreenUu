import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { Narrow, Stack } from '@/components/ui/Layout';
import { safeNext } from '@/features/account/schema';
import { SignInForm } from '@/features/account/ui/SignInForm';
import { getSessionUser } from '@/server/auth/session';

export async function generateMetadata() {
  return { title: (await getTranslations('auth'))('signInTitle') };
}

export default async function SignInPage({ searchParams }: PageProps<'/connexion'>) {
  const { next } = await searchParams;
  const nextPath = typeof next === 'string' ? next : undefined;
  if (await getSessionUser()) redirect(safeNext(nextPath));
  const t = await getTranslations('auth');
  return (
    <Narrow>
      <Stack>
        <h1>{t('signInTitle')}</h1>
        <SignInForm next={nextPath} />
      </Stack>
    </Narrow>
  );
}
