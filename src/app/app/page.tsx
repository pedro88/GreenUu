import { getTranslations } from 'next-intl/server';
import { LinkButton } from '@/components/ui/Button';
import { Card, Grid, Muted, PageHeader, Stack } from '@/components/ui/Layout';
import { VerifyBanner } from '@/features/account/ui/VerifyBanner';
import { listMyGardens } from '@/features/garden/service';
import { GardenCard } from '@/features/garden/ui/GardenCard';
import { requireUser } from '@/server/auth/session';
import { appClock } from '@/server/clock';
import { myTasksToday } from '@/features/ticket/queries';
import { MyTasks } from '@/features/ticket/ui/MyTasks';
import { db } from '@/server/db/client';

export async function generateMetadata() {
  return { title: (await getTranslations('dashboard'))('title') };
}

/** Tableau de bord : tâches du jour et jardins. Quêtes et XP arrivent au lot 6. */
export default async function DashboardPage() {
  const u = await requireUser();
  const t = await getTranslations('dashboard');
  const gardens = await listMyGardens(db(), u.id);
  return (
    <Stack gap="lg">
      <PageHeader title={t('hello', { name: u.pseudo ?? u.name })} />
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
