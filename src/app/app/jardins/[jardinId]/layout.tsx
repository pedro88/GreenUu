import { Sun } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Alert } from '@/components/ui/Alert';
import styles from '@/features/garden/ui/GardenHeader.module.scss';
import { GardenNav } from '@/features/garden/ui/GardenNav';
import { getGarden } from '@/features/garden/service';
import { currentSeasonLabel } from '@/features/season/queries';
import { requireGardenScope } from '@/server/page-guards';
import { can } from '@/server/authz/scope';
import { appClock } from '@/server/clock';
import { db } from '@/server/db/client';

export default async function GardenLayout({ children, params }: LayoutProps<'/app/jardins/[jardinId]'>) {
  const { jardinId } = await params;
  const scope = await requireGardenScope(jardinId);
  const g = await getGarden(db(), scope);
  const t = await getTranslations('garden');
  const season = await currentSeasonLabel(db(), scope, appClock().now(), g.timezone);
  return (
    <>
      <header className={styles.header}>
        <div className={styles.titleRow}>
          <h1 data-testid="garden-title">{g.name}</h1>
          {season ? <span className={styles.season}><Sun aria-hidden size={18} />{t(`season.${season.astronomical}`, { year: season.year })}</span> : null}
        </div>
        <GardenNav gardenId={scope.gardenId} showSettings={can(scope, 'garden:update') || scope.role === 'owner'} />
      </header>
      {scope.archived ? <Alert tone="warning">{t('archivedBanner')}</Alert> : null}
      {children}
    </>
  );
}
