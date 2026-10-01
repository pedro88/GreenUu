import { getTranslations } from 'next-intl/server';
import { LinkButton } from '@/components/ui/Button';
import { Card, Muted, PageHeader, Stack } from '@/components/ui/Layout';
import { cultureFiltersSchema } from '@/features/culture/schema';
import { listCultures } from '@/features/culture/service';
import { CultureFilters } from '@/features/culture/ui/CultureFilters';
import { CultureList } from '@/features/culture/ui/CultureList';
import { listSeasons } from '@/features/season/service';
import { listZoneRows } from '@/features/zone/service';
import { can } from '@/server/authz/scope';
import { db } from '@/server/db/client';
import { requireGardenScope } from '@/server/page-guards';

export async function generateMetadata() {
  return { title: (await getTranslations('cultures'))('title') };
}

export default async function CulturesPage({ params, searchParams }: PageProps<'/app/jardins/[jardinId]/cultures'>) {
  const { jardinId } = await params;
  const scope = await requireGardenScope(jardinId);
  const t = await getTranslations('cultures');
  const parsed = cultureFiltersSchema.safeParse(await searchParams);
  const filters = parsed.success ? parsed.data : {};
  const [rows, all, seasons, zones] = await Promise.all([
    listCultures(db(), scope, filters), listCultures(db(), scope, {}), listSeasons(db(), scope.gardenId), listZoneRows(db(), scope),
  ]);
  const speciesOptions = [...new Map(all.map((c) => [c.speciesId, c.label.split(' ')[0] ?? c.label])).entries()].map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label, 'fr'));
  return (
    <Stack gap="lg">
      <PageHeader title={t('title')} actions={can(scope, 'culture:create') ? <LinkButton href={`/app/jardins/${scope.gardenId}/cultures/nouvelle`} data-testid="new-culture">{t('new')}</LinkButton> : null} />
      <CultureFilters years={seasons.map((s) => s.year).reverse()} zones={zones.map((z) => ({ id: z.id, label: `${'— '.repeat(z.depth)}${z.name}` }))} speciesOptions={speciesOptions} />
      {rows.length === 0 ? <Card><Muted>{all.length === 0 ? t('empty') : t('noMatch')}</Muted></Card> : <CultureList gardenId={scope.gardenId} rows={rows} />}
    </Stack>
  );
}
