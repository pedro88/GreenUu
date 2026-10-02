import { getTranslations } from 'next-intl/server';
import { LinkButton } from '@/components/ui/Button';
import Link from 'next/link';
import { Card, Muted, PageHeader, Row, Stack } from '@/components/ui/Layout';
import { cultureFiltersSchema } from '@/features/culture/schema';
import { countCultures, CULTURE_PAGE_SIZE, cultureSpeciesOptions, listCultures } from '@/features/culture/queries';
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
  const sp = await searchParams;
  const parsed = cultureFiltersSchema.safeParse(sp);
  const filters = parsed.success ? parsed.data : {};
  const shown = Math.min(500, Math.max(CULTURE_PAGE_SIZE, Number(sp.voir) || CULTURE_PAGE_SIZE));
  const [rows, total, speciesOptions, seasons, zones] = await Promise.all([
    listCultures(db(), scope, filters, { limit: shown }), countCultures(db(), scope, filters), cultureSpeciesOptions(db(), scope),
    listSeasons(db(), scope.gardenId), listZoneRows(db(), scope),
  ]);
  const more = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === 'string' && k !== 'voir' ? [[k, v]] : [])));
  more.set('voir', String(shown + CULTURE_PAGE_SIZE));
  return (
    <Stack gap="lg">
      <PageHeader title={t('title')} actions={can(scope, 'culture:create') ? <LinkButton href={`/app/jardins/${scope.gardenId}/cultures/nouvelle`} data-testid="new-culture">{t('new')}</LinkButton> : null} />
      <CultureFilters years={seasons.map((s) => s.year).reverse()} zones={zones.map((z) => ({ id: z.id, label: `${'— '.repeat(z.depth)}${z.name}` }))} speciesOptions={speciesOptions} />
      {rows.length === 0 ? <Card><Muted>{speciesOptions.length === 0 ? t('empty') : t('noMatch')}</Muted></Card> : <CultureList gardenId={scope.gardenId} rows={rows} />}
      {total > rows.length ? (
        <Row>
          <Muted>{t('shown', { shown: rows.length, total })}</Muted>
          <Link href={`?${more.toString()}`} data-testid="cultures-more">{t('showMore')}</Link>
        </Row>
      ) : null}
    </Stack>
  );
}
