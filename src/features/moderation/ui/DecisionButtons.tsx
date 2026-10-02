'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { FormError } from '@/components/ui/FormError';
import { Row } from '@/components/ui/Layout';
import { useAction } from '@/components/ui/useAction';
import { decideReportsAction } from '../actions';

/** RG-MOD-03 : rejeter (réafficher) ou retirer le contenu signalé. */
export function DecisionButtons({ target }: { target: { kind: 'guide' | 'tip' | 'user'; id: string } }) {
  const t = useTranslations('moderation');
  const decide = useAction(decideReportsAction);
  return (
    <Row>
      <FormError error={decide.error} />
      <Button variant="secondary" disabled={decide.pending} onClick={() => void decide.run({ target, decision: 'dismissed' })} data-testid={`dismiss-${target.id}`}>{t('dismiss')}</Button>
      <Button disabled={decide.pending} onClick={() => void decide.run({ target, decision: 'actioned' })} data-testid={`action-${target.id}`}>{t('action')}</Button>
    </Row>
  );
}
