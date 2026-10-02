import { getTranslations } from 'next-intl/server';
import { LinkButton } from '@/components/ui/Button';
import { Badge, Card, Grid, Muted, Row, Stack } from '@/components/ui/Layout';
import { getGarden } from '@/features/garden/service';
import { listMembers } from '@/features/member/service';
import { zoneTree } from '@/features/zone/service';
import { displayPrefsOf } from '@/features/display/service';
import { listProblems } from '@/features/journal/queries';
import { sceneSnapshot } from '@/features/scene/snapshot';
import { GardenView } from '@/game/GardenView';
import { ViewToggle } from '@/game/ViewToggle';
import { notFound } from 'next/navigation';
import { DomainError } from '@/lib/errors';
import { uuidSchema } from '@/lib/zod';
import { requireUser } from '@/server/auth/session';
import { requireGardenScope } from '@/server/page-guards';
import { appClock } from '@/server/clock';
import { db } from '@/server/db/client';

/**
 * Page d'un jardin (PAGES.md §4 `/`) : vue jardin gamifiée ou vue classique, selon `?vue=` puis la préférence
 * enregistrée (MAP-12). La vue classique n'importe jamais le moteur (MAP-01).
 */
export default async function GardenPage({ params, searchParams }: PageProps<'/app/jardins/[jardinId]'>) {
  const { jardinId } = await params;
  const sp = await searchParams;
  const scope = await requireGardenScope(jardinId);
  const u = await requireUser();
  const prefs = await displayPrefsOf(db(), u.id);
  const view = sp.vue === 'classique' ? 'classic' : sp.vue === 'jardin' ? 'garden' : prefs.defaultView;
  if (view === 'garden') {
    const scene = typeof sp.scene === 'string' && uuidSchema.safeParse(sp.scene).success ? sp.scene : null;
    const [snapshot, problems] = await Promise.all([
      // Une scène inconnue ou sans intérieur donne une 404, comme une ressource absente.
      sceneSnapshot(db(), scope, { userId: u.id, sceneZoneId: scene, now: appClock().now() }).catch((e: unknown) => { if (e instanceof DomainError && e.code === 'NOT_FOUND') notFound(); throw e; }),
      listProblems(db()),
    ]);
    return <GardenView snapshot={snapshot} problems={problems.map((p) => ({ code: p.code, category: p.category }))} />;
  }
  return <ClassicOverview jardinId={jardinId} />;
}

/** Vue d'ensemble classique (lot 1). */
async function ClassicOverview({ jardinId }: { jardinId: string }) {
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
    <Stack>
    <Row><ViewToggle gardenId={scope.gardenId} to="garden" /></Row>
    <Grid data-testid="garden-overview">
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
    </Stack>
  );
}
