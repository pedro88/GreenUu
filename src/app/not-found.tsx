import { Home, Sprout } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { SystemPage } from '@/components/layout/SystemPage';
import { LinkButton } from '@/components/ui/Button';

export default async function NotFound() {
  const t = await getTranslations('system');
  return (
    <SystemPage testId="page-404" art={<Sprout size={72} />} title={t('notFoundTitle')} text={t('notFoundText')}
      actions={<>
        <LinkButton href="/app/jardins" variant="honey" size="large" block>{t('backToGarden')}</LinkButton>
        <LinkButton href="/" variant="secondary" size="large" block><Home aria-hidden size={18} />{t('home')}</LinkButton>
      </>} />
  );
}
