'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogActions, DialogClose } from '@/components/ui/Dialog';
import { FormError } from '@/components/ui/FormError';
import { Row } from '@/components/ui/Layout';
import { useAction } from '@/components/ui/useAction';
import { cultureOutcomeAction, deleteCultureAction, restoreCultureAction } from '../actions';

export function CultureActions({ gardenId, cultureId, deleted, canDelete, canEdit, ended }: { gardenId: string; cultureId: string; deleted: boolean; canDelete: boolean; canEdit: boolean; ended: boolean }) {
  const t = useTranslations('cultureDetail');
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const outcome = useAction(cultureOutcomeAction);
  const del = useAction(deleteCultureAction, { onSuccess: () => setConfirm(false) });
  const restore = useAction(restoreCultureAction);
  if (deleted) {
    return (
      <Alert tone="warning">
        <Row>
          <span data-testid="culture-deleted">{t('deletedBanner')}</span>
          {canDelete ? <Button variant="secondary" onClick={() => void restore.run({ gardenId, cultureId })} disabled={restore.pending}>{t('restore')}</Button> : null}
        </Row>
        <FormError error={restore.error} />
      </Alert>
    );
  }
  return (
    <Row>
      <FormError error={outcome.error ?? del.error} />
      {canEdit && !ended ? (
        <>
          <Button variant="secondary" onClick={() => void outcome.run({ gardenId, cultureId, outcome: 'failed' })}>{t('markFailed')}</Button>
          <Button variant="secondary" onClick={() => void outcome.run({ gardenId, cultureId, outcome: 'abandoned' })}>{t('markAbandoned')}</Button>
        </>
      ) : null}
      {canDelete ? (
        <Dialog open={confirm} onOpenChange={setConfirm} title={t('deleteTitle')} description={t('deleteDescription')} trigger={<Button variant="ghost">{t('delete')}</Button>}>
          <DialogActions>
            <DialogClose asChild><Button variant="secondary">{t('cancel')}</Button></DialogClose>
            <Button variant="danger" onClick={() => void del.run({ gardenId, cultureId }).then((r) => { if (r.ok) router.refresh(); })} disabled={del.pending}>{t('deleteConfirm')}</Button>
          </DialogActions>
        </Dialog>
      ) : null}
    </Row>
  );
}
