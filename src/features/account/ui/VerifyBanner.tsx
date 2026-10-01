'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Row } from '@/components/ui/Layout';
import { useAction } from '@/components/ui/useAction';
import { resendVerification } from '../actions';

/** RG-AUTH-02 : rappel tant que l'adresse n'est pas confirmée. */
export function VerifyBanner({ email }: { email: string }) {
  const t = useTranslations('auth');
  const [sent, setSent] = useState(false);
  const action = useAction(resendVerification, { refresh: false, onSuccess: () => setSent(true) });
  return (
    <Alert tone="warning">
      <Row>
        <span data-testid="verify-banner">{t('verifyBanner', { email })}</span>
        {sent ? <strong>{t('verifyResent')}</strong> : <Button variant="secondary" onClick={() => void action.run(undefined)} disabled={action.pending}>{t('verifyResend')}</Button>}
      </Row>
    </Alert>
  );
}
