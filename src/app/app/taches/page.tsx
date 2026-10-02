import { getTranslations } from 'next-intl/server';
import { PageHeader, Stack } from '@/components/ui/Layout';
import { myTasksToday } from '@/features/ticket/queries';
import { MyTasks } from '@/features/ticket/ui/MyTasks';
import { requireUser } from '@/server/auth/session';
import { appClock } from '@/server/clock';
import { db } from '@/server/db/client';

export async function generateMetadata() {
  return { title: (await getTranslations('tickets'))('myTasksTitle') };
}

export default async function MyTasksPage() {
  const u = await requireUser();
  const t = await getTranslations('tickets');
  return (
    <Stack gap="lg">
      <PageHeader title={t('myTasksTitle')} />
      <MyTasks groups={await myTasksToday(db(), u.id, appClock().now())} />
    </Stack>
  );
}
