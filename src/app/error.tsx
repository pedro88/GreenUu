'use client';

import { CloudRain } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { SystemPage } from '@/components/layout/SystemPage';
import { Button, LinkButton } from '@/components/ui/Button';

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations('system');
  return (
    <SystemPage testId="page-error" art={<CloudRain size={72} />} title={t('errorTitle')} text={t('errorText')}
      actions={<>
        <Button size="large" block onClick={reset}>{t('retry')}</Button>
        <LinkButton href="/" variant="secondary" size="large" block>{t('home')}</LinkButton>
      </>} />
  );
}
