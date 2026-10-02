import { getTranslations } from 'next-intl/server';
import { LinkButton } from '@/components/ui/Button';
import { PageHeader, Row, Stack } from '@/components/ui/Layout';
import { listGuidesFor } from '@/features/guide/queries';
import { guideFiltersSchema } from '@/features/guide/schema';
import { GuideFilters } from '@/features/guide/ui/GuideFilters';
import { GuideList } from '@/features/guide/ui/GuideList';
import { KnowledgeTabs } from '@/features/guide/ui/KnowledgeTabs';
import { listSpecies } from '@/features/plant/service';
import { requireUser } from '@/server/auth/session';
import { db } from '@/server/db/client';

export async function generateMetadata() {
  return { title: (await getTranslations('guides'))('title') };
}

/** Guides (PAGES.md §5) : recherche, filtres de contexte, mes guides. */
export default async function GuidesPage({ searchParams }: PageProps<'/app/guides'>) {
  const u = await requireUser();
  const t = await getTranslations('guides');
  const raw = await searchParams;
  const parsed = guideFiltersSchema.safeParse(Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, typeof v === 'string' ? v : undefined])));
  const filters = parsed.success ? parsed.data : {};
  const [rows, species] = await Promise.all([listGuidesFor(db(), u, filters), listSpecies(db())]);
  return (
    <Stack gap="lg">
      <KnowledgeTabs active="guides" />
      <PageHeader title={t('title')} actions={<LinkButton href="/app/guides/nouveau" data-testid="guide-new">{t('new')}</LinkButton>} />
      <Row>
        <LinkButton href="/app/guides" variant={filters.mes ? 'secondary' : undefined} aria-current={filters.mes ? undefined : 'page'}>{t('all')}</LinkButton>
        <LinkButton href="/app/guides?mes=1" variant={filters.mes ? undefined : 'secondary'} aria-current={filters.mes ? 'page' : undefined} data-testid="guide-mine">{t('mine')}</LinkButton>
      </Row>
      <GuideFilters action="/app/guides" species={species.map((s) => ({ id: s.id, name: s.names.fr[0] ?? s.latinName }))} values={filters} />
      <GuideList rows={rows} hrefOf={(r) => `/app/guides/${r.id}`} />
    </Stack>
  );
}
