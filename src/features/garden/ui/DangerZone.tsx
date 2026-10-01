'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogActions, DialogClose } from '@/components/ui/Dialog';
import { Field, NativeSelect, TextInput } from '@/components/ui/Field';
import { FormError } from '@/components/ui/FormError';
import { Row, Stack } from '@/components/ui/Layout';
import { useAction } from '@/components/ui/useAction';
import { archiveGardenAction, deleteGardenAction, transferGardenAction, unarchiveGardenAction } from '../actions';

export function DangerZone({ gardenId, gardenName, archived, admins }: { gardenId: string; gardenName: string; archived: boolean; admins: { id: string; pseudo: string }[] }) {
  const t = useTranslations('settings');
  const router = useRouter();
  const [confirmName, setConfirmName] = useState('');
  const [transferTo, setTransferTo] = useState(admins[0]?.id ?? '');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const archive = useAction(archived ? unarchiveGardenAction : archiveGardenAction);
  const transfer = useAction(transferGardenAction, { onSuccess: () => setTransferOpen(false) });
  const del = useAction(deleteGardenAction, { refresh: false, onSuccess: () => router.push('/app/jardins') });
  return (
    <Stack>
      <FormError error={archive.error} />
      <Row>
        <Button variant="secondary" onClick={() => void archive.run({ gardenId })} disabled={archive.pending}>{archived ? t('unarchive') : t('archive')}</Button>
        <Dialog open={transferOpen} onOpenChange={setTransferOpen} title={t('transferTitle')} description={t('transferDescription')}
          trigger={<Button variant="secondary" disabled={admins.length === 0}>{t('transfer')}</Button>}>
          <Stack>
            <FormError error={transfer.error} />
            <Field label={t('transferTo')}>{(p) => (
              <NativeSelect {...p} value={transferTo} onChange={(e) => setTransferTo(e.target.value)}>
                {admins.map((a) => <option key={a.id} value={a.id}>{a.pseudo}</option>)}
              </NativeSelect>
            )}</Field>
            <DialogActions>
              <DialogClose asChild><Button variant="secondary">{t('cancel')}</Button></DialogClose>
              <Button onClick={() => void transfer.run({ gardenId, toMemberId: transferTo })} disabled={transfer.pending || !transferTo}>{t('transferConfirm')}</Button>
            </DialogActions>
          </Stack>
        </Dialog>
        <Dialog open={deleteOpen} onOpenChange={setDeleteOpen} title={t('deleteTitle')} description={t('deleteDescription', { name: gardenName })}
          trigger={<Button variant="danger">{t('delete')}</Button>}>
          <Stack>
            <FormError error={del.error && !Object.keys(del.fieldErrors).length ? del.error : null} />
            <Field label={t('deleteConfirmLabel', { name: gardenName })} errors={del.fieldErrors.confirmName}>{(p) => <TextInput {...p} value={confirmName} onChange={(e) => setConfirmName(e.target.value)} />}</Field>
            <DialogActions>
              <DialogClose asChild><Button variant="secondary">{t('cancel')}</Button></DialogClose>
              <Button variant="danger" onClick={() => void del.run({ gardenId, confirmName })} disabled={del.pending || confirmName.trim() !== gardenName}>{t('deleteConfirm')}</Button>
            </DialogActions>
          </Stack>
        </Dialog>
      </Row>
    </Stack>
  );
}
