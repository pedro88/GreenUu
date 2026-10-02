import { getTranslations } from 'next-intl/server';
import { Card, Muted, PageHeader, Stack } from '@/components/ui/Layout';
import { effectivePreference } from '@/features/notification/prefs.pure';
import { listPreferences } from '@/features/notification/service';
import { PreferencesForm } from '@/features/notification/ui/PreferencesForm';
import { NOTIFICATION_TYPES } from '@/lib/enums';
import { requireUser } from '@/server/auth/session';
import { db } from '@/server/db/client';

export async function generateMetadata() {
  return { title: (await getTranslations('notifications'))('preferences') };
}

export default async function NotificationPrefsPage() {
  const u = await requireUser();
  const t = await getTranslations('notifications');
  const stored = await listPreferences(db(), u.id);
  const initial: Record<string, boolean> = {};
  for (const type of NOTIFICATION_TYPES) {
    for (const ch of ['in_app', 'email'] as const) initial[`${type}:${ch}`] = effectivePreference(type, ch, stored.find((s) => s.type === type && s.channel === ch)?.enabled);
  }
  return (
    <Stack gap="lg">
      <PageHeader title={t('preferences')} />
      <Muted>{t('preferencesIntro')}</Muted>
      <Card><PreferencesForm types={[...NOTIFICATION_TYPES]} initial={initial} /></Card>
    </Stack>
  );
}
