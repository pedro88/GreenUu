import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { PageHeader, Stack } from '@/components/ui/Layout';
import { listNotifications } from '@/features/notification/service';
import { NotificationList } from '@/features/notification/ui/NotificationList';
import { requireUser } from '@/server/auth/session';
import { db } from '@/server/db/client';

export async function generateMetadata() {
  return { title: (await getTranslations('notifications'))('title') };
}

export default async function NotificationsPage() {
  const u = await requireUser();
  const t = await getTranslations('notifications');
  const items = await listNotifications(db(), u.id);
  return (
    <Stack gap="lg">
      <PageHeader title={t('title')} actions={<Link href="/app/parametres/notifications">{t('preferences')}</Link>} />
      <NotificationList items={items.map((n) => ({ id: n.id, type: n.type, payload: n.payload, count: n.count, readAt: n.readAt, createdAt: n.createdAt }))} />
    </Stack>
  );
}
