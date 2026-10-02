'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { FormError } from '@/components/ui/FormError';
import { Stack } from '@/components/ui/Layout';
import { useAction } from '@/components/ui/useAction';
import { setResultSharingAction } from '../actions';

/** §11.2 : le texte de consentement est affiché avant l'activation ; la révocation est un clic. */
export function ShareResults({ gardenId, initial, consentVersion }: { gardenId: string; initial: boolean; consentVersion: string }) {
  const t = useTranslations('sharing');
  const [enabled, setEnabled] = useState(initial);
  const action = useAction(setResultSharingAction, { onSuccess: (d) => setEnabled(d.enabled) });
  return (
    <Stack>
      <p data-testid="share-consent-text">{t('consentText')}</p>
      <FormError error={action.error} />
      <Alert tone={enabled ? 'success' : 'info'} role="status"><span data-testid="share-state">{enabled ? t('enabled') : t('disabled')}</span></Alert>
      <Button variant={enabled ? 'secondary' : undefined} disabled={action.pending} data-testid="share-toggle"
        onClick={() => void action.run({ gardenId, enabled: !enabled, ...(enabled ? {} : { consentVersion }) })}>
        {enabled ? t('disable') : t('enable')}
      </Button>
    </Stack>
  );
}
