import { getTranslations } from 'next-intl/server';
import { PageHeader, Stack } from '@/components/ui/Layout';
import { avatarEditorData } from '@/features/avatar/service';
import { AvatarEditor } from '@/features/avatar/ui/AvatarEditor';
import { requireUser } from '@/server/auth/session';
import { db } from '@/server/db/client';

export async function generateMetadata() {
  return { title: (await getTranslations('avatar'))('title') };
}

/** Éditeur d'avatar (PAGES.md §6, SPEC §10.4). */
export default async function AvatarPage() {
  const u = await requireUser();
  const t = await getTranslations('avatar');
  const { catalog, avatar } = await avatarEditorData(db(), u.id);
  return (
    <Stack gap="lg">
      <PageHeader title={t('title')} />
      <AvatarEditor catalog={catalog} avatar={avatar} />
    </Stack>
  );
}
