import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Alert } from '@/components/ui/Alert';
import { Card, Narrow, Stack } from '@/components/ui/Layout';
import { RegisterForm } from '@/features/account/ui/RegisterForm';
import { previewInvitation } from '@/features/member/service';
import { AcceptInvitation } from '@/features/member/ui/AcceptInvitation';
import { getSessionUser } from '@/server/auth/session';
import { appClock } from '@/server/clock';
import { db } from '@/server/db/client';

export async function generateMetadata() {
  return { title: (await getTranslations('invitation'))('title') };
}

export default async function InvitationPage({ params }: PageProps<'/invitation/[token]'>) {
  const { token } = await params;
  const t = await getTranslations('invitation');
  const tr = await getTranslations('roles');
  const preview = await previewInvitation(db(), token, appClock().now());
  if (preview.status === 'invalid') {
    return (
      <Narrow>
        <Stack>
          <h1>{t('title')}</h1>
          <Alert tone="warning"><span data-testid="invitation-invalid">{t('invalid')}</span></Alert>
          <Link href="/">{t('backHome')}</Link>
        </Stack>
      </Narrow>
    );
  }
  const me = await getSessionUser();
  return (
    <Narrow>
      <Stack>
        <h1>{t('title')}</h1>
        <Card>
          <p>{t.rich('summary', { inviter: preview.inviterName, garden: preview.gardenName, role: tr(preview.role), strong: (c) => <strong>{c}</strong> })}</p>
        </Card>
        {me ? (
          me.email.toLowerCase() === preview.email.toLowerCase() ? (
            <AcceptInvitation token={token} />
          ) : (
            <Alert tone="warning">{t('otherEmail', { email: me.email })}</Alert>
          )
        ) : (
          <>
            <h2>{t('createAccount')}</h2>
            <RegisterForm invitation={{ token, email: preview.email }} />
            <p>
              {t('hasAccount')} <Link href={`/connexion?next=${encodeURIComponent(`/invitation/${token}`)}`}>{t('signIn')}</Link>
            </p>
          </>
        )}
      </Stack>
    </Narrow>
  );
}
