'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { FormError } from '@/components/ui/FormError';
import { Stack } from '@/components/ui/Layout';
import { useAction } from '@/components/ui/useAction';
import { unsubscribeAction } from '../actions';

/** RG-NTF-04 : la désinscription n'est appliquée qu'au clic (les préchargements de liens ne désinscrivent pas). */
export function UnsubscribeForm({ token, typeLabel }: { token: string; typeLabel: string }) {
  const t = useTranslations('notifications');
  const [done, setDone] = useState(false);
  const action = useAction(unsubscribeAction, { refresh: false, onSuccess: () => setDone(true) });
  if (done) {
    return <Alert tone="success"><span data-testid="unsubscribed">{t('unsubscribeDone', { type: typeLabel })}</span></Alert>;
  }
  return (
    <form method="post" onSubmit={(e) => { e.preventDefault(); void action.run({ token }); }}>
      <Stack>
        <FormError error={action.error} />
        <p data-testid="unsubscribe-confirm">{t('unsubscribeConfirm', { type: typeLabel })}</p>
        <Button type="submit" size="large" block disabled={action.pending} data-testid="unsubscribe-submit">{t('unsubscribeSubmit')}</Button>
      </Stack>
    </form>
  );
}
