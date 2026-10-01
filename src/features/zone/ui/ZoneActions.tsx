'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogActions, DialogClose } from '@/components/ui/Dialog';
import { Field, NativeSelect } from '@/components/ui/Field';
import { FormError } from '@/components/ui/FormError';
import { Row, Stack } from '@/components/ui/Layout';
import { useAction } from '@/components/ui/useAction';
import { archiveZoneAction, moveZoneAction, unarchiveZoneAction } from '../actions';
import { ZoneForm, type ZoneFormValues, type ZoneTypeOption } from './ZoneForm';

export function ZoneActions({ gardenId, zoneId, archived, types, initial, moveTargets, currentParentId }: {
  gardenId: string; zoneId: string; archived: boolean; types: ZoneTypeOption[]; initial: ZoneFormValues;
  moveTargets: { id: string; label: string }[]; currentParentId: string | null;
}) {
  const t = useTranslations('zones');
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [target, setTarget] = useState(currentParentId ?? '');
  const move = useAction(moveZoneAction, { onSuccess: () => setMoveOpen(false) });
  const archive = useAction(archiveZoneAction, { onSuccess: () => { setArchiveOpen(false); router.push(`/app/jardins/${gardenId}/zones`); } });
  const unarchive = useAction(unarchiveZoneAction);
  if (archived) {
    return (
      <Stack gap="sm">
        <FormError error={unarchive.error} />
        <Row><Button variant="secondary" onClick={() => void unarchive.run({ gardenId, zoneId })} disabled={unarchive.pending}>{t('unarchive')}</Button></Row>
      </Stack>
    );
  }
  return (
    <Row>
      <Dialog open={editOpen} onOpenChange={setEditOpen} title={t('editTitle')} trigger={<Button variant="secondary" data-testid="zone-edit">{t('edit')}</Button>}>
        <ZoneForm gardenId={gardenId} zoneId={zoneId} types={types} initial={initial} onDone={() => setEditOpen(false)} />
      </Dialog>
      <Dialog open={moveOpen} onOpenChange={setMoveOpen} title={t('moveTitle')} trigger={<Button variant="secondary">{t('move')}</Button>}>
        <form onSubmit={(e) => { e.preventDefault(); void move.run({ gardenId, zoneId, parentId: target === '' ? null : target }); }}>
          <Stack>
            <FormError error={move.error} />
            <Field label={t('newParent')} errors={move.fieldErrors.parentId}>{(p) => (
              <NativeSelect {...p} value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="">{t('rootLevel')}</option>
                {moveTargets.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </NativeSelect>
            )}</Field>
            <DialogActions>
              <DialogClose asChild><Button variant="secondary">{t('cancel')}</Button></DialogClose>
              <Button type="submit" disabled={move.pending}>{t('move')}</Button>
            </DialogActions>
          </Stack>
        </form>
      </Dialog>
      <Dialog open={archiveOpen} onOpenChange={(o) => { setArchiveOpen(o); if (!o) archive.reset(); }} title={t('archiveTitle')} description={t('archiveDescription')}
        trigger={<Button variant="secondary" data-testid="zone-archive">{t('archive')}</Button>}>
        {archive.error?.message === 'zoneHasActiveCultures' ? (
          <Alert tone="warning"><span data-testid="zone-has-cultures">{t('archiveHasCultures')}</span></Alert>
        ) : <FormError error={archive.error} />}
        <DialogActions>
          <DialogClose asChild><Button variant="secondary">{t('cancel')}</Button></DialogClose>
          {archive.error?.message === 'zoneHasActiveCultures' ? (
            <Button variant="danger" onClick={() => void archive.run({ gardenId, zoneId, finishActiveCultures: true })} disabled={archive.pending} data-testid="zone-archive-finish">{t('archiveFinishCultures')}</Button>
          ) : (
            <Button variant="danger" onClick={() => void archive.run({ gardenId, zoneId, finishActiveCultures: false })} disabled={archive.pending} data-testid="zone-archive-confirm">{t('archiveConfirm')}</Button>
          )}
        </DialogActions>
      </Dialog>
    </Row>
  );
}
