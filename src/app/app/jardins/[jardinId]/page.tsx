import { getTranslations } from 'next-intl/server';
import { LinkButton } from '@/components/ui/Button';
import { Badge, Card, Grid, Muted, Row, Stack } from '@/components/ui/Layout';
import { getGarden } from '@/features/garden/service';
import { listMembers } from '@/features/member/service';
import { zoneTree } from '@/features/zone/service';
import { requireGardenScope } from '@/server/page-guards';
import { appClock } from '@/server/clock';
import { db } from '@/server/db/client';

/** Vue d'ensemble (vue classique). La vue jardin gamifiée remplacera cette page par défaut au lot 7. */
export default async function GardenOverviewPage({ params }: PageProps<'/app/jardins/[jardinId]'>) {
  const { jardinId } = await params;
  const scope = await requireGardenScope(jardinId);
  const t = await getTranslations('garden');
  const to = await getTranslations('orgTypes');
  const te = await getTranslations('environments');
  const ts = await getTranslations('soilTypes');
  const tr = await getTranslations('roles');
  const g = await getGarden(db(), scope);
  const zones = await zoneTree(db(), scope, { includeArchived: false });
  const { active } = await listMembers(db(), scope, appClock().now());
  return (
    <Grid>
      <Card>
        <Stack gap="sm">
          <h2>{t('aboutTitle')}</h2>
          <Row><Badge>{to(g.orgType)}</Badge><Badge>{tr(scope.role)}</Badge></Row>
          <Row>{g.environments.map((e) => <Badge key={e}>{te(e)}</Badge>)}</Row>
          {g.placeLabel ? <p>{g.placeLabel}</p> : null}
          <Muted>{t('contextLine', { soil: ts(g.soilType), koppen: g.koppen ?? '—', altitude: g.altitudeM ?? '—' })}</Muted>
        </Stack>
      </Card>
      <Card>
        <Stack gap="sm">
          <h2>{t('zonesTitle')}</h2>
          <p>{t('zonesCount', { count: zones.length })}</p>
          <LinkButton href={`/app/jardins/${scope.gardenId}/zones`} variant="secondary">{t('seeZones')}</LinkButton>
        </Stack>
      </Card>
      <Card>
        <Stack gap="sm">
          <h2>{t('membersTitle')}</h2>
          <p>{t('membersCount', { count: active.length })}</p>
          <LinkButton href={`/app/jardins/${scope.gardenId}/membres`} variant="secondary">{t('seeMembers')}</LinkButton>
        </Stack>
      </Card>
    </Grid>
  );
}
