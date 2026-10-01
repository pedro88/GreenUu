'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { LinkButton } from '@/components/ui/Button';
import { Stack } from '@/components/ui/Layout';
import { verifyEmail } from '../actions';

type State = 'pending' | 'verified' | 'alreadyUsed' | 'linkExpired' | 'linkInvalid';

/** Confirme l'adresse au montage (une seule fois), via une Server Action qui peut poser le cookie de session. */
export function VerifyEmail({ token }: { token: string }) {
  const t = useTranslations('auth');
  const [state, setState] = useState<State>('pending');
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void verifyEmail({ token }).then((r) => setState(r.ok ? r.data.status : r.error.message === 'linkExpired' ? 'linkExpired' : 'linkInvalid'));
  }, [token]);
  if (state === 'pending') return <Alert>{t('verifyPending')}</Alert>;
  return (
    <Stack>
      <Alert tone={state === 'verified' ? 'success' : state === 'alreadyUsed' ? 'info' : 'danger'} role="status">
        <span data-testid="verify-status" data-state={state}>{t(`verify_${state}`)}</span>
      </Alert>
      <LinkButton href={state === 'verified' ? '/bienvenue' : '/app'}>{t('continue')}</LinkButton>
    </Stack>
  );
}
