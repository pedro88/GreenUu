'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Field';
import { FormError } from '@/components/ui/FormError';
import { Stack } from '@/components/ui/Layout';
import { useAction } from '@/components/ui/useAction';
import { requestDeletionAction, requestExportAction, restoreAccountAction } from '../actions';

export function ExportRequest() {
  const t = useTranslations('privacy');
  const [done, setDone] = useState(false);
  const action = useAction(requestExportAction, { onSuccess: () => setDone(true) });
  return (
    <Stack gap="sm">
      <FormError error={action.error} />
      {done ? <Alert tone="success" role="status"><span data-testid="export-requested">{t('exportRequested')}</span></Alert>
        : <Button onClick={() => void action.run({})} disabled={action.pending} data-testid="export-request">{t('exportSubmit')}</Button>}
    </Stack>
  );
}

/** §11.4 : désactivation immédiate, puis suppression à J+30 sauf rétablissement. Double confirmation explicite. */
export function DeletionRequest() {
  const t = useTranslations('privacy');
  const [confirm, setConfirm] = useState(false);
  const [toMember, setToMember] = useState(false);
  const [purgeOn, setPurgeOn] = useState<string | null>(null);
  const action = useAction(requestDeletionAction, { refresh: false, onSuccess: (d) => setPurgeOn(d.purgeOn) });
  if (purgeOn) return <Alert tone="warning" role="status"><span data-testid="deletion-requested">{t('deleteRequested', { date: purgeOn })}</span></Alert>;
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (confirm) void action.run({ confirm: true, confirmTransferToMember: toMember }); }}>
      <Stack gap="sm">
        <FormError error={action.error} />
        <Checkbox label={t('deleteConfirm')} checked={confirm} onChange={(e) => setConfirm(e.target.checked)} data-testid="deletion-confirm" />
        <Checkbox label={t('deleteTransferMember')} checked={toMember} onChange={(e) => setToMember(e.target.checked)} />
        <Button type="submit" variant="danger" disabled={!confirm || action.pending} data-testid="deletion-submit">{t('deleteSubmit')}</Button>
      </Stack>
    </form>
  );
}

export function RestoreForm({ token }: { token: string }) {
  const t = useTranslations('restore');
  const [done, setDone] = useState(false);
  const action = useAction(restoreAccountAction, { refresh: false, onSuccess: () => setDone(true) });
  if (done) return <Alert tone="success" role="status"><span data-testid="restore-done">{t('done')}</span></Alert>;
  return (
    <Stack gap="sm">
      <p>{t('confirm')}</p>
      <FormError error={action.error} />
      <Button size="large" onClick={() => void action.run({ token })} disabled={action.pending} data-testid="restore-submit">{t('submit')}</Button>
    </Stack>
  );
}
