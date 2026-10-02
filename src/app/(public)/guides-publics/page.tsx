import { getTranslations } from 'next-intl/server';
import { PageHeader, Stack } from '@/components/ui/Layout';
import { listPublicGuides } from '@/features/guide/queries';
import { guideFiltersSchema } from '@/features/guide/schema';
import { GuideFilters } from '@/features/guide/ui/GuideFilters';
import { GuideList } from '@/features/guide/ui/GuideList';
import { listSpecies } from '@/features/plant/service';
import { db } from '@/server/db/client';

export async function generateMetadata() {
  const t = await getTranslations('guides');
  return { title: t('publicTitle'), description: t('publicIntro') };
}

/** Guides publics (PAGES.md §1), consultables sans compte ; les non listés n'y figurent jamais (RG-GUI-03). */
export default async function PublicGuidesPage({ searchParams }: PageProps<'/guides-publics'>) {
  const t = await getTranslations('guides');
  const raw = await searchParams;
  const parsed = guideFiltersSchema.safeParse(Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, typeof v === 'string' ? v : undefined])));
  const filters = parsed.success ? { ...parsed.data, mes: undefined } : {};
  const [rows, species] = await Promise.all([listPublicGuides(db(), filters), listSpecies(db())]);
  return (
    <Stack gap="lg">
      <PageHeader title={t('publicTitle')} subtitle={t('publicIntro')} />
      <GuideFilters action="/guides-publics" species={species.map((s) => ({ id: s.id, name: s.names.fr[0] ?? s.latinName }))} values={filters} />
      <GuideList rows={rows} hrefOf={(r) => `/guides-publics/${r.slug}`} />
    </Stack>
  );
}
