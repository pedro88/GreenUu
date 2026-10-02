'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { FormError } from '@/components/ui/FormError';
import { useAction } from '@/components/ui/useAction';
import { forkGuideAction, publishGuideAction } from '../actions';

export function ForkButton({ guideId }: { guideId: string }) {
  const t = useTranslations('guides');
  const router = useRouter();
  const fork = useAction(forkGuideAction, { refresh: false, onSuccess: (d) => router.push(`/app/guides/${d.guideId}/edition`) });
  return (
    <>
      <FormError error={fork.error} />
      <Button variant="secondary" onClick={() => void fork.run({ guideId })} disabled={fork.pending} data-testid="guide-fork">{t('fork')}</Button>
    </>
  );
}

export function PublishButton({ guideId }: { guideId: string }) {
  const t = useTranslations('guides');
  const publish = useAction(publishGuideAction);
  return (
    <>
      <FormError error={publish.error} />
      <Button onClick={() => void publish.run({ guideId })} disabled={publish.pending} data-testid="guide-publish">{t('publish')}</Button>
    </>
  );
}
