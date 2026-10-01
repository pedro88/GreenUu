import { forbidden } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { NewCultureWizard } from '@/features/culture/ui/NewCultureWizard';
import { getGarden } from '@/features/garden/service';
import { cultivableZones } from '@/features/zone/service';
import { localDate } from '@/lib/dates';
import { can } from '@/server/authz/scope';
import { appClock } from '@/server/clock';
import { db } from '@/server/db/client';
import { requireGardenScope } from '@/server/page-guards';

export async function generateMetadata() {
  return { title: (await getTranslations('newCulture'))('title') };
}

export default async function NewCulturePage({ params, searchParams }: PageProps<'/app/jardins/[jardinId]/cultures/nouvelle'>) {
  const { jardinId } = await params;
  const { zone } = await searchParams;
  const scope = await requireGardenScope(jardinId);
  if (!can(scope, 'culture:create')) forbidden();
  const g = await getGarden(db(), scope);
  const zones = await cultivableZones(db(), scope);
  return <NewCultureWizard gardenId={scope.gardenId} zones={zones} initialZoneId={typeof zone === 'string' && zones.some((z) => z.id === zone) ? zone : null} today={localDate(appClock().now(), g.timezone)} />;
}
