'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogActions, DialogClose } from '@/components/ui/Dialog';
import { FormError } from '@/components/ui/FormError';
import { useAction } from '@/components/ui/useAction';
import { leaveGardenAction } from '../actions';

export function LeaveGarden({ gardenId }: { gardenId: string }) {
  const t = useTranslations('members');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const action = useAction(leaveGardenAction, { refresh: false, onSuccess: () => router.push('/app/jardins') });
  return (
    <Dialog open={open} onOpenChange={setOpen} title={t('leaveTitle')} description={t('leaveDescription')} trigger={<Button variant="ghost">{t('leave')}</Button>}>
      <FormError error={action.error} />
      <DialogActions>
        <DialogClose asChild><Button variant="secondary">{t('cancel')}</Button></DialogClose>
        <Button variant="danger" onClick={() => void action.run({ gardenId })} disabled={action.pending}>{t('leaveConfirm')}</Button>
      </DialogActions>
    </Dialog>
  );
}
