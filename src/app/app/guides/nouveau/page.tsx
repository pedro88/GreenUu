import { getTranslations } from 'next-intl/server';
import { PageHeader, Stack } from '@/components/ui/Layout';
import { editorOptions } from '@/features/guide/queries';
import { GuideEditor } from '@/features/guide/ui/GuideEditor';
import { requireUser } from '@/server/auth/session';
import { db } from '@/server/db/client';

export async function generateMetadata() {
  return { title: (await getTranslations('guides'))('editorNew') };
}

/** Éditeur de guide (PAGES.md §5) : Markdown, contexte, espèce, calendrier type, visibilité (D-19). */
export default async function NewGuidePage({ searchParams }: PageProps<'/app/guides/nouveau'>) {
  const u = await requireUser();
  const t = await getTranslations('guides');
  const { espece } = await searchParams;
  const opts = await editorOptions(db(), u.id);
  const speciesId = typeof espece === 'string' && opts.species.some((s) => s.id === espece) ? espece : (opts.species[0]?.id ?? '');
  return (
    <Stack gap="lg">
      <PageHeader title={t('editorNew')} />
      <GuideEditor guideId={null} species={opts.species} varieties={opts.varieties} gardens={opts.gardens} lockedPrivateGardenId={null}
        initial={{ speciesId, varietyId: null, visibility: 'public', gardenId: null, draft: { title: '', bodyMd: '', context: { v: 1 }, calendarTemplate: null } }} />
    </Stack>
  );
}
