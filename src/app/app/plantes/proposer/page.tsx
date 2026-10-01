import { getTranslations } from 'next-intl/server';
import { Muted, PageHeader, Stack } from '@/components/ui/Layout';
import { VerifyBanner } from '@/features/account/ui/VerifyBanner';
import { listMyGardens } from '@/features/garden/service';
import { listSpecies } from '@/features/plant/service';
import { ProposeVarietyForm } from '@/features/plant/ui/ProposeVarietyForm';
import { requireUser } from '@/server/auth/session';
import { db } from '@/server/db/client';

export async function generateMetadata() {
  return { title: (await getTranslations('plants'))('proposeTitle') };
}

export default async function ProposePage({ searchParams }: PageProps<'/app/plantes/proposer'>) {
  const u = await requireUser();
  const { espece, jardin } = await searchParams;
  const t = await getTranslations('plants');
  const species = await listSpecies(db());
  const gardens = (await listMyGardens(db(), u.id)).filter((g) => g.role !== 'observer' && !g.archivedAt);
  return (
    <Stack gap="lg">
      <PageHeader title={t('proposeTitle')} />
      <Muted>{t('proposeIntro')}</Muted>
      {!u.emailVerified ? <VerifyBanner email={u.email} /> : null}
      <ProposeVarietyForm species={species.map((s) => ({ id: s.id, label: s.names.fr[0] ?? s.latinName }))} gardens={gardens.map((g) => ({ id: g.id, name: g.name }))}
        initialSpeciesId={typeof espece === 'string' ? espece : null} initialGardenId={typeof jardin === 'string' ? jardin : null} />
    </Stack>
  );
}
