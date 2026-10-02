'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogActions } from '@/components/ui/Dialog';
import { Field, NativeSelect, TextInput } from '@/components/ui/Field';
import { FormError } from '@/components/ui/FormError';
import { Muted, Row, Stack } from '@/components/ui/Layout';
import { useAction } from '@/components/ui/useAction';
import type { Stage } from '@/lib/enums';
import { applyGuideAction } from '../actions';

type Conflict = { stage: Stage; current: string; proposed: string };

/**
 * RG-GUI-05 : appliquer un guide à une culture. Les cultures (depuis un guide) ou les guides (depuis une culture)
 * sont proposés ; si des dates prévues existent déjà, l'utilisateur choisit de les remplacer ou de les garder (GUI-09).
 */
export function ApplyGuideDialog({ options, anchorLabel, today, triggerLabel }: {
  options: { key: string; label: string; gardenId: string; cultureId: string; guideId: string; anchorLabel?: string }[];
  anchorLabel: string; today: string; triggerLabel: string;
}) {
  const t = useTranslations('guides');
  const ts = useTranslations('stages');
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState(options[0]?.key ?? '');
  const [anchorOn, setAnchorOn] = useState(today);
  const [conflicts, setConflicts] = useState<Conflict[] | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const action = useAction(applyGuideAction, {
    onSuccess: (d) => { if (d.status === 'needsConfirmation') setConflicts(d.conflicts); else { setConflicts(null); setDone(d.tickets ?? 0); } },
  });
  const selected = options.find((o) => o.key === choice);
  const run = (overwrite?: boolean) => {
    if (!selected) return;
    void action.run({ gardenId: selected.gardenId, cultureId: selected.cultureId, guideId: selected.guideId, anchorOn, ...(overwrite === undefined ? {} : { overwrite }) });
  };
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setConflicts(null); setDone(null); action.reset(); } }} title={t('applyTitle')}
      trigger={<Button data-testid="guide-apply-open">{triggerLabel}</Button>}>
      {done !== null ? <Alert tone="success" role="status"><span data-testid="guide-applied">{t('applied', { count: done })}</span></Alert>
        : options.length === 0 ? <Muted>{t('applyNone')}</Muted> : (
          <Stack>
            <FormError error={action.error} />
            <Field label={t('applyGuide')}>{(p) => (
              <NativeSelect {...p} value={choice} onChange={(e) => { setChoice(e.target.value); setConflicts(null); }} data-testid="guide-apply-choice">
                {options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
              </NativeSelect>
            )}</Field>
            <Field label={t('applyAnchor', { stage: selected?.anchorLabel ?? anchorLabel })}>{(p) => <TextInput {...p} type="date" required value={anchorOn} onChange={(e) => { setAnchorOn(e.target.value); setConflicts(null); }} data-testid="guide-apply-anchor" />}</Field>
            {conflicts ? (
              <Stack gap="sm" data-testid="guide-apply-conflicts">
                <Alert tone="warning">{t('applyConflicts')}</Alert>
                <ul>{conflicts.map((c) => <li key={c.stage}>{ts(c.stage)} : {c.current} → {c.proposed}</li>)}</ul>
                <Row>
                  <Button onClick={() => run(true)} disabled={action.pending} data-testid="guide-apply-overwrite">{t('applyOverwrite')}</Button>
                  <Button variant="secondary" onClick={() => run(false)} disabled={action.pending} data-testid="guide-apply-keep">{t('applyKeep')}</Button>
                </Row>
              </Stack>
            ) : (
              <DialogActions><Button onClick={() => run()} disabled={action.pending || !selected} data-testid="guide-apply-submit">{t('applySubmit')}</Button></DialogActions>
            )}
          </Stack>
        )}
    </Dialog>
  );
}
