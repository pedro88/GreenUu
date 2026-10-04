import { getTranslations } from 'next-intl/server';
import { Narrow, Stack } from '@/components/ui/Layout';

export async function generateMetadata() {
  const t = await getTranslations('legal.cgu');
  return { title: t('title') };
}

export default async function LegalPage() {
  const t = await getTranslations('legal.cgu');
  return (
    <Narrow>
      <Stack>
        <h1>{t('title')}</h1>
        <p>{t('body')}</p>
        <p data-testid="data-sources">{t('sources')}</p>
      </Stack>
    </Narrow>
  );
}
