import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/Button';
import { NativeSelect } from '@/components/ui/Field';
import { PageHeader, Row, Stack } from '@/components/ui/Layout';
import { listSpecies } from '@/features/plant/service';
import { RecoList } from '@/features/reco/ui/RecoList';
import { currentPeriod, PERIODS, recommendationView } from '@/features/reco/view';
import { cultivableZones } from '@/features/zone/service';
import { uuidSchema } from '@/lib/zod';
import { appClock } from '@/server/clock';
import { db } from '@/server/db/client';
import { requireGardenScope } from '@/server/page-guards';

export async function generateMetadata() {
  return { title: (await getTranslations('reco'))('title') };
}

/** « Que planter ? » (PAGES.md §4) : suggestions par zone et période, avec explication et confiance (§7). */
export default async function RecommendationsPage({ params, searchParams }: PageProps<'/app/jardins/[jardinId]/recommandations'>) {
  const { jardinId } = await params;
  const scope = await requireGardenScope(jardinId);
  const sp = await searchParams;
  const t = await getTranslations('reco');
  const now = appClock().now();
  const [zones, species] = await Promise.all([cultivableZones(db(), scope), listSpecies(db())]);
  const zoneId = typeof sp.zone === 'string' && zones.some((z) => z.id === sp.zone) ? sp.zone : zones[0]?.id;
  const period = PERIODS.find((p) => p === sp.periode) ?? currentPeriod(now.getUTCMonth());
  const speciesId = typeof sp.espece === 'string' && uuidSchema.safeParse(sp.espece).success ? sp.espece : undefined;
  const view = zoneId ? await recommendationView(db(), scope, { zoneId, period, year: now.getUTCFullYear(), speciesId }) : null;
  return (
    <Stack gap="lg">
      <PageHeader title={t('title')} subtitle={t('intro')} />
      <form method="get" data-testid="reco-filters">
        <Row>
          <label htmlFor="reco-zone">{t('zone')}</label>
          <NativeSelect id="reco-zone" name="zone" defaultValue={zoneId}>{zones.map((z) => <option key={z.id} value={z.id}>{z.label}</option>)}</NativeSelect>
          <label htmlFor="reco-periode">{t('period')}</label>
          <NativeSelect id="reco-periode" name="periode" defaultValue={period}>{PERIODS.map((p) => <option key={p} value={p}>{t(p)}</option>)}</NativeSelect>
          <label htmlFor="reco-espece">{t('species')}</label>
          <NativeSelect id="reco-espece" name="espece" defaultValue={speciesId ?? ''}>
            <option value="">{t('anySpecies')}</option>
            {species.map((s) => <option key={s.id} value={s.id}>{s.names.fr[0] ?? s.latinName}</option>)}
          </NativeSelect>
          <Button type="submit" variant="secondary">{t('submit')}</Button>
        </Row>
      </form>
      {view ? <div data-engine={view.version}><RecoList items={view.items} coldStart={view.coldStart} /></div> : null}
    </Stack>
  );
}
