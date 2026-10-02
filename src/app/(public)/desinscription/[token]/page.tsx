import { getTranslations } from 'next-intl/server';
import { Alert } from '@/components/ui/Alert';
import { Narrow, Stack } from '@/components/ui/Layout';
import { unsubscribeTarget } from '@/features/notification/service';
import { UnsubscribeForm } from '@/features/notification/ui/UnsubscribeForm';
import { tDynamic } from '@/i18n/dynamic';

export async function generateMetadata() {
  return { title: (await getTranslations('notifications'))('unsubscribeTitle') };
}

/** RG-NTF-04 / NTF-04 : lien de désinscription d'un type d'e-mail, sans connexion (jeton signé). Le GET ne modifie rien. */
export default async function UnsubscribePage({ params }: PageProps<'/desinscription/[token]'>) {
  const { token: raw } = await params;
  const token = decodeURIComponent(raw);
  const t = await getTranslations('notifications');
  const tt = await getTranslations('notificationTypes');
  const target = unsubscribeTarget(token);
  if (!target) {
    return <Narrow><Alert tone="danger">{t('unsubscribeInvalid')}</Alert></Narrow>;
  }
  return (
    <Narrow>
      <Stack>
        <h1>{t('unsubscribeTitle')}</h1>
        <UnsubscribeForm token={token} typeLabel={tDynamic(tt, target.type, target.type)} />
      </Stack>
    </Narrow>
  );
}
