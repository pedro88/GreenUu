import { forbidden } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Card, Stack } from '@/components/ui/Layout';
import { getGarden } from '@/features/garden/service';
import { DangerZone } from '@/features/garden/ui/DangerZone';
import { GardenSettingsForm } from '@/features/garden/ui/GardenSettingsForm';
import { listMembers } from '@/features/member/service';
import { listPracticeCatalog, practicesForZone } from '@/features/practice/service';
import { PracticesEditor } from '@/features/practice/ui/PracticesEditor';
import { zoneTypeOptions } from '@/features/zone/queries';
import { ZoneTypesEditor } from '@/features/zone/ui/ZoneTypesEditor';
import { SHARE_CONSENT_VERSION, sharingState } from '@/features/result/service';
import { ShareResults } from '@/features/result/ui/ShareResults';
import { requireGardenScope } from '@/server/page-guards';
import { can } from '@/server/authz/scope';
import { appClock } from '@/server/clock';
import { db } from '@/server/db/client';

export async function generateMetadata() {
  return { title: (await getTranslations('settings'))('title') };
}

export default async function GardenSettingsPage({ params }: PageProps<'/app/jardins/[jardinId]/parametres'>) {
  const { jardinId } = await params;
  const scope = await requireGardenScope(jardinId);
  if (!can(scope, 'garden:update') && scope.role !== 'owner') forbidden();
  const t = await getTranslations('settings');
  const g = await getGarden(db(), scope);
  const catalog = (await listPracticeCatalog(db())).map((p) => p.code);
  const practices = await practicesForZone(db(), scope, [], appClock().now().getFullYear());
  const types = (await zoneTypeOptions(db(), scope)).filter((ty) => ty.isCustom);
  const { active } = await listMembers(db(), scope, appClock().now());
  const editable = can(scope, 'garden:update');
  const shared = await sharingState(db(), scope.gardenId);
  const ts = await getTranslations('sharing');
  return (
    <Stack gap="lg">
      {editable ? (
        <Card>
          <Stack>
            <h2>{t('infoTitle')}</h2>
            <GardenSettingsForm gardenId={scope.gardenId} initial={{
              name: g.name, orgType: g.orgType, environments: g.environments, placeLabel: g.placeLabel ?? '',
              lat: g.location?.lat.toString() ?? '', lng: g.location?.lng.toString() ?? '', altitudeM: g.altitudeM?.toString() ?? '',
              soilType: g.soilType, soilPh: g.soilPh?.toString() ?? '', exposure: g.exposure ?? '', waterAccess: g.waterAccess ?? '',
              koppen: g.koppen ?? '', hardinessZone: g.hardinessZone ?? '', timezone: g.timezone,
              seasonStartMonth: String(g.seasonStartMonth), planEditMinRole: g.planEditMinRole === 'member' ? 'member' : 'admin',
            }} />
          </Stack>
        </Card>
      ) : null}
      <Card>
        <Stack>
          <h2>{t('practicesTitle')}</h2>
          <PracticesEditor gardenId={scope.gardenId} zoneId={null} catalog={catalog} declared={practices.ownDeclared} excluded={[]} inherited={[]} readOnly={!editable} />
        </Stack>
      </Card>
      {editable ? (
        <Card>
          <Stack>
            <h2>{t('zoneTypesTitle')}</h2>
            <ZoneTypesEditor gardenId={scope.gardenId} custom={types.map((ty) => ({ id: ty.id, label: ty.label }))} />
          </Stack>
        </Card>
      ) : null}
      <Card>
        <Stack>
          <h2>{ts('title')}</h2>
          {can(scope, 'garden:share_results') ? <ShareResults gardenId={scope.gardenId} initial={shared} consentVersion={SHARE_CONSENT_VERSION} /> : <p>{shared ? ts('banner') : ts('ownerOnly')}</p>}
        </Stack>
      </Card>
      {scope.role === 'owner' ? (
        <Card>
          <Stack>
            <h2>{t('dangerTitle')}</h2>
            <DangerZone gardenId={scope.gardenId} gardenName={g.name} archived={scope.archived}
              admins={active.filter((m) => m.role === 'admin').map((m) => ({ id: m.id, pseudo: m.pseudo ?? m.name }))} />
          </Stack>
        </Card>
      ) : null}
    </Stack>
  );
}
