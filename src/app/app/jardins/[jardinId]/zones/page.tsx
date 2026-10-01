import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Alert } from '@/components/ui/Alert';
import { Card, Muted, PageHeader, Row, Stack } from '@/components/ui/Layout';
import { zoneTypeOptions } from '@/features/zone/queries';
import { canCreateRootZone, zoneTree } from '@/features/zone/service';
import { NewZoneButton } from '@/features/zone/ui/NewZoneButton';
import { ZoneTree } from '@/features/zone/ui/ZoneTree';
import { requireGardenScope } from '@/server/page-guards';
import { db } from '@/server/db/client';

export async function generateMetadata() {
  return { title: (await getTranslations('zones'))('title') };
}

export default async function ZonesPage({ params, searchParams }: PageProps<'/app/jardins/[jardinId]/zones'>) {
  const { jardinId } = await params;
  const sp = await searchParams;
  const includeArchived = sp.archives === '1';
  const scope = await requireGardenScope(jardinId);
  const t = await getTranslations('zones');
  const tree = await zoneTree(db(), scope, { includeArchived });
  const types = await zoneTypeOptions(db(), scope);
  const canCreate = canCreateRootZone(scope);
  const base = `/app/jardins/${scope.gardenId}/zones`;
  return (
    <Stack gap="lg">
      <PageHeader title={t('title')} actions={canCreate ? <NewZoneButton gardenId={scope.gardenId} types={types} /> : null} />
      {sp.nouveau === '1' ? <Alert tone="success">{t('welcomeNewGarden')}</Alert> : null}
      <Row>
        <Link href={includeArchived ? base : `${base}?archives=1`}>{includeArchived ? t('hideArchived') : t('showArchived')}</Link>
      </Row>
      {tree.length === 0 ? (
        <Card><Muted>{canCreate ? t('emptyCanCreate') : t('empty')}</Muted></Card>
      ) : (
        <ZoneTree gardenId={scope.gardenId} nodes={tree} />
      )}
    </Stack>
  );
}
