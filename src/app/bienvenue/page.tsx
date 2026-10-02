import { getTranslations } from 'next-intl/server';
import styles from '@/components/layout/AppShell.module.scss';
import { Alert } from '@/components/ui/Alert';
import { Stack } from '@/components/ui/Layout';
import { VerifyBanner } from '@/features/account/ui/VerifyBanner';
import { avatarEditorData } from '@/features/avatar/service';
import { WelcomeAvatarStep } from '@/features/avatar/ui/WelcomeAvatarStep';
import { GardenWizard } from '@/features/garden/ui/GardenWizard';
import { listPracticeCatalog } from '@/features/practice/service';
import { requireUser } from '@/server/auth/session';
import { db } from '@/server/db/client';

export async function generateMetadata() {
  return { title: (await getTranslations('wizard'))('welcomeTitle') };
}

/** Onboarding (PAGES.md §2) : avatar (étape 1), puis assistant du premier jardin. */
export default async function WelcomePage() {
  const u = await requireUser();
  const t = await getTranslations('wizard');
  const [practices, avatarData] = await Promise.all([listPracticeCatalog(db()), avatarEditorData(db(), u.id)]);
  return (
    <main id="contenu" className={styles.main}>
      <Stack gap="lg">
        {!u.emailVerified ? (
          <>
            <Alert tone="info">{t('verifyFirst')}</Alert>
            <VerifyBanner email={u.email} />
          </>
        ) : null}
        <WelcomeAvatarStep catalog={avatarData.catalog} avatar={avatarData.avatar}>
          <GardenWizard practices={practices.map((p) => ({ code: p.code }))} />
        </WelcomeAvatarStep>
      </Stack>
    </main>
  );
}
