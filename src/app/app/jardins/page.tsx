import { getTranslations } from 'next-intl/server';
import { LinkButton } from '@/components/ui/Button';
import { Card, Grid, Muted, PageHeader, Stack } from '@/components/ui/Layout';
import { listMyGardens } from '@/features/garden/service';
import { GardenCard } from '@/features/garden/ui/GardenCard';
import { requireUser } from '@/server/auth/session';
import { db } from '@/server/db/client';

export async function generateMetadata() {
  return { title: (await getTranslations('gardens'))('title') };
}

export default async function GardensPage() {
  const u = await requireUser();
  const t = await getTranslations('gardens');
  const gardens = await listMyGardens(db(), u.id);
  return (
    <Stack gap="lg">
      <PageHeader title={t('title')} actions={<LinkButton href="/app/jardins/nouveau">{t('create')}</LinkButton>} />
      {gardens.length === 0 ? (
        <Card><Muted>{t('empty')}</Muted></Card>
      ) : (
        <Grid data-testid="garden-list">{gardens.map((g) => <GardenCard key={g.id} garden={g} />)}</Grid>
      )}
      <Muted>{t('joinHint')}</Muted>
    </Stack>
  );
}
