import { getTranslations } from 'next-intl/server';
import { Card, PageHeader, Stack } from '@/components/ui/Layout';
import { displayPrefsOf } from '@/features/display/service';
import { DisplayForm } from '@/features/display/ui/DisplayForm';
import { requireUser } from '@/server/auth/session';
import { db } from '@/server/db/client';

export async function generateMetadata() {
  return { title: (await getTranslations('display'))('title') };
}

/** Affichage et accessibilité (PAGES.md §7 `/affichage`). */
export default async function DisplayPage() {
  const u = await requireUser();
  const t = await getTranslations('display');
  return (
    <Stack gap="lg">
      <PageHeader title={t('title')} />
      <Card><DisplayForm initial={await displayPrefsOf(db(), u.id)} /></Card>
    </Stack>
  );
}
