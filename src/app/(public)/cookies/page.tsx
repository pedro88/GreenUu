import { getTranslations } from 'next-intl/server';
import { Narrow, Stack } from '@/components/ui/Layout';

export async function generateMetadata() {
  const t = await getTranslations('legal.cookies');
  return { title: t('title') };
}

export default async function LegalPage() {
  const t = await getTranslations('legal.cookies');
  return (
    <Narrow>
      <Stack>
        <h1>{t('title')}</h1>
        <p>{t('body')}</p>
      </Stack>
    </Narrow>
  );
}
