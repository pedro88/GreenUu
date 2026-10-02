import { getTranslations } from 'next-intl/server';
import { Alert } from '@/components/ui/Alert';
import { PixelIcon } from '@/components/ui/PlantIcon';
import styles from '@/features/garden/ui/GardenHeader.module.scss';
import { GardenNav } from '@/features/garden/ui/GardenNav';
import { getGarden } from '@/features/garden/service';
import { sharingState } from '@/features/result/service';
import { currentSeasonLabel } from '@/features/season/queries';
import { requireGardenScope } from '@/server/page-guards';
import { can } from '@/server/authz/scope';
import { appClock } from '@/server/clock';
import { db } from '@/server/db/client';

const SEASON_ICON: Record<string, string> = { spring: 'ui/saison-printemps', summer: 'ui/saison-ete', autumn: 'ui/saison-automne', winter: 'ui/saison-hiver' };

export default async function GardenLayout({ children, params }: LayoutProps<'/app/jardins/[jardinId]'>) {
  const { jardinId } = await params;
  const scope = await requireGardenScope(jardinId);
  const g = await getGarden(db(), scope);
  const t = await getTranslations('garden');
  const [season, shared] = await Promise.all([currentSeasonLabel(db(), scope, appClock().now(), g.timezone), sharingState(db(), scope.gardenId)]);
  const tsh = await getTranslations('sharing');
  return (
    <>
      <header className={styles.header}>
        <div className={styles.titleRow}>
          <h1 data-testid="garden-title">{g.name}</h1>
          {season ? <span className={styles.season}><PixelIcon name={SEASON_ICON[season.astronomical] ?? 'ui/meteo-soleil'} size={24} />{t(`season.${season.astronomical}`, { year: season.year })}</span> : null}
        </div>
        <GardenNav gardenId={scope.gardenId} showSettings={can(scope, 'garden:update') || scope.role === 'owner'} />
      </header>
      {scope.archived ? <Alert tone="warning">{t('archivedBanner')}</Alert> : null}
      {shared ? <Alert tone="info"><span data-testid="share-banner">{tsh('banner')}</span></Alert> : null}
      {children}
    </>
  );
}
