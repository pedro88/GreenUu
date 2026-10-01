import { getTranslations } from 'next-intl/server';
import { Stack } from '@/components/ui/Layout';
import { VerifyBanner } from '@/features/account/ui/VerifyBanner';
import { GardenWizard } from '@/features/garden/ui/GardenWizard';
import { listPracticeCatalog } from '@/features/practice/service';
import { requireUser } from '@/server/auth/session';
import { db } from '@/server/db/client';

export async function generateMetadata() {
  return { title: (await getTranslations('gardens'))('create') };
}

export default async function NewGardenPage() {
  const u = await requireUser();
  const practices = await listPracticeCatalog(db());
  return (
    <Stack gap="lg">
      {!u.emailVerified ? <VerifyBanner email={u.email} /> : null}
      <GardenWizard practices={practices.map((p) => ({ code: p.code }))} />
    </Stack>
  );
}
