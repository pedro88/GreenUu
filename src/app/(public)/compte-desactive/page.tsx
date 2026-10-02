import { getTranslations } from 'next-intl/server';
import { Alert } from '@/components/ui/Alert';
import { Narrow, Stack } from '@/components/ui/Layout';

export async function generateMetadata() {
  return { title: (await getTranslations('restore'))('deactivatedTitle'), robots: { index: false } };
}

/** Confirmation après une demande de suppression (§11.4) : la session est déjà révoquée, la page est publique. */
export default async function DeactivatedPage({ searchParams }: PageProps<'/compte-desactive'>) {
  const { le } = await searchParams;
  const t = await getTranslations('restore');
  const date = typeof le === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(le) ? le : null;
  return (
    <Narrow>
      <Stack>
        <h1>{t('deactivatedTitle')}</h1>
        {date ? <Alert tone="warning" role="status"><span data-testid="deletion-requested">{t('deactivatedText', { date })}</span></Alert> : null}
      </Stack>
    </Narrow>
  );
}
