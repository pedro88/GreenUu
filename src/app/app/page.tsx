import { getLocale, getTranslations } from 'next-intl/server';
import { LinkButton } from '@/components/ui/Button';
import { Card, Grid, Muted, Stack } from '@/components/ui/Layout';
import { VerifyBanner } from '@/features/account/ui/VerifyBanner';
import { listMyGardens } from '@/features/garden/service';
import { GardenCard } from '@/features/garden/ui/GardenCard';
import { avatarOf } from '@/features/avatar/service';
import { questsOf } from '@/features/progression/quests';
import { questTitleParams } from '@/features/progression/quests.pure';
import { ticketTitle } from '@/features/ticket/ui/ticketText';
import { progressOf } from '@/features/progression/service';
import { DashboardHeader } from '@/features/progression/ui/DashboardHeader';
import { requireUser } from '@/server/auth/session';
import { appClock } from '@/server/clock';
import { myTasksToday } from '@/features/ticket/queries';
import { MyTasks } from '@/features/ticket/ui/MyTasks';
import { db } from '@/server/db/client';

export async function generateMetadata() {
  return { title: (await getTranslations('dashboard'))('title') };
}

/** Tableau de bord : niveau et quête du jour, tâches du jour et jardins. */
export default async function DashboardPage() {
  const u = await requireUser();
  const t = await getTranslations('dashboard');
  const [gardens, progress, quests, avatar] = await Promise.all([listMyGardens(db(), u.id), progressOf(db(), u.id), questsOf(db(), u.id), avatarOf(db(), u.id)]);
  // Titre de la quête du jour dans la langue de l'interface (POL-05).
  const daily = quests.find((q) => q.kind === 'daily');
  const locale = (await getLocale()) === 'en' ? 'en' : 'fr';
  const tAll = await getTranslations();
  return (
    <Stack gap="lg">
      <DashboardHeader name={u.pseudo ?? u.name} level={progress.level} totalXp={progress.totalXp} quest={daily ? { ...daily, titleParams: questTitleParams(daily, locale, (tk) => ticketTitle(tAll, tk)) } : null} avatar={avatar} />
      {!u.emailVerified ? <VerifyBanner email={u.email} /> : null}
      <section aria-labelledby="aujourdhui">
        <Stack>
          <h2 id="aujourdhui">{t('today')}</h2>
          <MyTasks groups={await myTasksToday(db(), u.id, appClock().now())} />
        </Stack>
      </section>
      <section aria-labelledby="mes-jardins">
        <Stack>
          <h2 id="mes-jardins">{t('myGardens')}</h2>
          {gardens.length === 0 ? (
            <Card>
              <Stack>
                <Muted>{t('noGarden')}</Muted>
                <LinkButton href="/bienvenue" size="large">{t('createFirst')}</LinkButton>
              </Stack>
            </Card>
          ) : (
            <Grid>{gardens.map((g) => <GardenCard key={g.id} garden={g} />)}</Grid>
          )}
        </Stack>
      </section>
    </Stack>
  );
}
