'use client';

import { Flag } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogActions } from '@/components/ui/Dialog';
import { Field, NativeSelect, TextArea } from '@/components/ui/Field';
import { FormError } from '@/components/ui/FormError';
import { Stack } from '@/components/ui/Layout';
import { useAction } from '@/components/ui/useAction';
import { REPORT_REASONS, type ReportReason } from '@/lib/enums';
import { reportContentAction } from '../../tip/actions';

/** RG-MOD-01 : signaler un guide, un tip ou un profil (motif + détail facultatif). */
export function ReportDialog({ target, label }: { target: { kind: 'guide' | 'tip' | 'user'; id: string }; label: string }) {
  const t = useTranslations('report');
  const tr = useTranslations('reportReasons');
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason>('spam');
  const [details, setDetails] = useState('');
  const [sent, setSent] = useState(false);
  const action = useAction(reportContentAction, { onSuccess: () => setSent(true) });
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setSent(false); action.reset(); } }} title={t('title')}
      trigger={<Button variant="secondary" aria-label={label} data-testid={`report-${target.kind}-${target.id}`}><Flag aria-hidden size={18} />{label}</Button>}>
      {sent ? <Alert tone="success" role="status"><span data-testid="report-sent">{t('sent')}</span></Alert> : (
        <form method="post" onSubmit={(e) => { e.preventDefault(); void action.run({ target, reason, details }); }}>
          <Stack>
            <FormError error={action.error} />
            <Field label={t('reason')}>{(p) => (
              <NativeSelect {...p} value={reason} onChange={(e) => setReason(REPORT_REASONS.find((r) => r === e.target.value) ?? reason)} data-testid="report-reason">
                {REPORT_REASONS.map((r) => <option key={r} value={r}>{tr(r)}</option>)}
              </NativeSelect>
            )}</Field>
            <Field label={t('details')}>{(p) => <TextArea {...p} maxLength={1000} value={details} onChange={(e) => setDetails(e.target.value)} />}</Field>
            <DialogActions><Button type="submit" disabled={action.pending} data-testid="report-send">{t('send')}</Button></DialogActions>
          </Stack>
        </form>
      )}
    </Dialog>
  );
}
