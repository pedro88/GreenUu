import { getTranslations } from 'next-intl/server';
import { Alert } from '@/components/ui/Alert';
import { Narrow, Stack } from '@/components/ui/Layout';
import { setPreference } from '@/features/notification/service';
import { tDynamic } from '@/i18n/dynamic';
import { NOTIFICATION_TYPES } from '@/lib/enums';
import { verifyPayload } from '@/lib/tokens';
import { db } from '@/server/db/client';
import { env } from '@/server/env';

export async function generateMetadata() {
  return { title: (await getTranslations('notifications'))('unsubscribeTitle') };
}

/** RG-NTF-04 / NTF-04 : lien de désinscription d'un type d'e-mail, sans connexion (jeton signé). */
export default async function UnsubscribePage({ params }: PageProps<'/desinscription/[token]'>) {
  const { token } = await params;
  const t = await getTranslations('notifications');
  const tt = await getTranslations('notificationTypes');
  const payload = verifyPayload(decodeURIComponent(token), env().BETTER_AUTH_SECRET);
  const [userId, type] = payload?.split(':') ?? [];
  const known = NOTIFICATION_TYPES.find((x) => x === type);
  if (!userId || !known) {
    return <Narrow><Alert tone="danger">{t('unsubscribeInvalid')}</Alert></Narrow>;
  }
  await setPreference(db(), userId, known, 'email', false);
  return (
    <Narrow>
      <Stack>
        <h1>{t('unsubscribeTitle')}</h1>
        <Alert tone="success"><span data-testid="unsubscribed">{t('unsubscribeDone', { type: tDynamic(tt, known, known) })}</span></Alert>
      </Stack>
    </Narrow>
  );
}
