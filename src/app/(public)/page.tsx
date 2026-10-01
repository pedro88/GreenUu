import { getTranslations } from 'next-intl/server';
import { LinkButton } from '@/components/ui/Button';
import { Narrow, Row, Stack } from '@/components/ui/Layout';
import { getSessionUser } from '@/server/auth/session';

export default async function HomePage() {
  const t = await getTranslations('home');
  const u = await getSessionUser();
  return (
    <Narrow>
      <Stack gap="lg">
        <h1>{t('title')}</h1>
        <p>{t('pitch')}</p>
        <ul>
          <li>{t('feature1')}</li>
          <li>{t('feature2')}</li>
          <li>{t('feature3')}</li>
        </ul>
        <Row>
          {u ? (
            <LinkButton href="/app" size="large">{t('openApp')}</LinkButton>
          ) : (
            <>
              <LinkButton href="/inscription" size="large">{t('signUp')}</LinkButton>
              <LinkButton href="/connexion" variant="secondary" size="large">{t('signIn')}</LinkButton>
            </>
          )}
        </Row>
      </Stack>
    </Narrow>
  );
}
