import { getTranslations } from 'next-intl/server';
import { Card, Muted, PageHeader, Stack } from '@/components/ui/Layout';
import { pendingVarieties, varietiesForGarden } from '@/features/plant/service';
import { ModerationRow } from '@/features/plant/ui/ModerationRow';
import { db } from '@/server/db/client';

export async function generateMetadata() {
  return { title: (await getTranslations('moderation'))('varietiesTitle') };
}

/** File de modération des variétés proposées (RG-PLT-03). */
export default async function AdminVarietiesPage() {
  const t = await getTranslations('moderation');
  const pending = await pendingVarieties(db());
  const rows = await Promise.all(pending.map(async (p) => ({
    ...p,
    targets: (await varietiesForGarden(db(), p.v.speciesId, '00000000-0000-0000-0000-000000000000')).filter((v) => v.status === 'approved'),
  })));
  return (
    <Stack gap="lg">
      <PageHeader title={t('varietiesTitle')} />
      <Card>
        {rows.length === 0 ? <Muted>{t('empty')}</Muted> : (
          <ul data-testid="moderation-queue">
            {rows.map((r) => <ModerationRow key={r.v.id} varietyId={r.v.id} label={`${r.speciesNames.fr[0] ?? ''} ${r.v.name}`} mergeTargets={r.targets.map((x) => ({ id: x.id, name: x.name }))} />)}
          </ul>
        )}
      </Card>
    </Stack>
  );
}
