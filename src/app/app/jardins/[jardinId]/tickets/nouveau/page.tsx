import { forbidden } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { PageHeader, Stack } from '@/components/ui/Layout';
import { listGroups } from '@/features/group/service';
import { listMembers } from '@/features/member/service';
import { runningCultures } from '@/features/ticket/queries';
import { gardenToday } from '@/features/ticket/shared';
import { TicketForm } from '@/features/ticket/ui/TicketForm';
import { listZoneRows } from '@/features/zone/service';
import { can } from '@/server/authz/scope';
import { appClock } from '@/server/clock';
import { db } from '@/server/db/client';
import { requireGardenScope } from '@/server/page-guards';

export async function generateMetadata() {
  return { title: (await getTranslations('tickets'))('new') };
}

export default async function NewTicketPage({ params, searchParams }: PageProps<'/app/jardins/[jardinId]/tickets/nouveau'>) {
  const { jardinId } = await params;
  const sp = await searchParams;
  const scope = await requireGardenScope(jardinId);
  if (!can(scope, 'ticket:create')) forbidden();
  const t = await getTranslations('tickets');
  const [zones, cultures, groups, { active }] = await Promise.all([listZoneRows(db(), scope), runningCultures(db(), scope), listGroups(db(), scope), listMembers(db(), scope, appClock().now())]);
  return (
    <Stack gap="lg">
      <PageHeader title={t('new')} />
      <TicketForm gardenId={scope.gardenId} today={await gardenToday(db(), scope.gardenId, appClock().now())}
        zones={zones.map((z) => ({ id: z.id, label: `${'— '.repeat(z.depth)}${z.name}` }))} cultures={cultures}
        members={active.filter((m) => m.role !== 'observer').map((m) => ({ id: m.id, pseudo: m.pseudo ?? m.name }))} groups={groups.map((g) => ({ id: g.id, name: g.name }))}
        initialZoneId={typeof sp.zone === 'string' ? sp.zone : null} initialCultureId={typeof sp.culture === 'string' ? sp.culture : null} />
    </Stack>
  );
}
