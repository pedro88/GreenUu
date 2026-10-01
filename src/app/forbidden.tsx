import { Fence } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { SystemPage } from '@/components/layout/SystemPage';
import { LinkButton } from '@/components/ui/Button';

/** 403 sans aucune donnée du jardin demandé (SPEC §5.4, AUTHZ-01). */
export default async function Forbidden() {
  const t = await getTranslations('system');
  return (
    <SystemPage testId="page-403" art={<Fence size={72} />} title={t('forbiddenTitle')} text={t('forbiddenText')}
      actions={<LinkButton href="/app/jardins" variant="honey" size="large" block>{t('myGardens')}</LinkButton>} />
  );
}
