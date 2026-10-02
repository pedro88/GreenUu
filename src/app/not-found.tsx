import { getTranslations } from 'next-intl/server';
import { SystemPage } from '@/components/layout/SystemPage';
import { LinkButton } from '@/components/ui/Button';
import { PixelIcon } from '@/components/ui/PlantIcon';

export default async function NotFound() {
  const t = await getTranslations('system');
  return (
    <SystemPage testId="page-404" art={<PixelIcon name="art/epouvantail" size={64} />} title={t('notFoundTitle')} text={t('notFoundText')}
      actions={<>
        <LinkButton href="/app/jardins" variant="honey" size="large" block><PixelIcon name="nav/jardin" size={24} />{t('backToGarden')}</LinkButton>
        <LinkButton href="/" variant="secondary" size="large" block><PixelIcon name="nav/accueil" size={24} />{t('home')}</LinkButton>
      </>} />
  );
}
