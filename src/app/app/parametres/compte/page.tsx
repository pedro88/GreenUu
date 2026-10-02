import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Card, PageHeader, Stack } from '@/components/ui/Layout';
import { getProfile } from '@/features/account/service';
import { AccountForm } from '@/features/account/ui/AccountForm';
import { requireUser } from '@/server/auth/session';
import { db } from '@/server/db/client';

export async function generateMetadata() {
  return { title: (await getTranslations('account'))('title') };
}

export default async function AccountPage() {
  const u = await requireUser();
  const t = await getTranslations('account');
  const p = await getProfile(db(), u.id);
  return (
    <Stack gap="lg">
      <PageHeader title={t('title')} subtitle={u.email} />
      <Card>
        <AccountForm initial={{ pseudo: p?.pseudo ?? '', timezone: p?.timezone ?? 'Europe/Paris', locale: p?.locale === 'en' ? 'en' : 'fr' }} />
      </Card>
      <Link href="/app/parametres/confidentialite">{t('privacyLink')}</Link>
      <Link href="/app/parametres/affichage" data-testid="display-link">{t('displayLink')}</Link>
    </Stack>
  );
}
