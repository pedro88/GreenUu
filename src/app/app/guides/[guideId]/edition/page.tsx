import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { PageHeader, Stack } from '@/components/ui/Layout';
import { editorOptions, loadGuide, lockedPrivateGarden } from '@/features/guide/queries';
import { GuideEditor } from '@/features/guide/ui/GuideEditor';
import { DomainError } from '@/lib/errors';
import { uuidSchema } from '@/lib/zod';
import { canEditGuide } from '@/server/authz/content';
import { requireUser } from '@/server/auth/session';
import { db } from '@/server/db/client';

export async function generateMetadata() {
  return { title: (await getTranslations('guides'))('editorEdit') };
}

/** Réédition du brouillon : auteur seulement (§5.2) ; sinon 404, sans révéler le guide. */
export default async function EditGuidePage({ params }: PageProps<'/app/guides/[guideId]/edition'>) {
  const u = await requireUser();
  const { guideId } = await params;
  if (!uuidSchema.safeParse(guideId).success) notFound();
  const g = await loadGuide(db(), guideId).catch((e: unknown) => {
    if (e instanceof DomainError && e.code === 'NOT_FOUND') notFound();
    throw e;
  });
  if (!canEditGuide(u, { authorId: g.authorId, deleted: g.deletedAt !== null })) notFound();
  const t = await getTranslations('guides');
  const [opts, locked] = await Promise.all([editorOptions(db(), u.id), lockedPrivateGarden(db(), g)]);
  return (
    <Stack gap="lg">
      <PageHeader title={t('editorEdit')} />
      <GuideEditor guideId={g.id} species={opts.species} varieties={opts.varieties} gardens={opts.gardens} lockedPrivateGardenId={locked}
        initial={{ speciesId: g.speciesId, varietyId: g.varietyId, visibility: g.visibility, gardenId: g.gardenId, draft: g.draft }} />
    </Stack>
  );
}
