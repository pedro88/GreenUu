'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { NativeSelect, TextInput } from '@/components/ui/Field';
import { FormError } from '@/components/ui/FormError';
import { Row, Stack } from '@/components/ui/Layout';
import { useAction } from '@/components/ui/useAction';
import type { Stage } from '@/lib/enums';
import { recordStageAction } from '../actions';

type Row_ = { stage: Stage; plannedOn: string | null; actualOn: string | null };

/** Saisie des dates d'étapes ; repiquage / plantation vers une autre zone (CUL-08). */
export function StageEditor({ gardenId, cultureId, stages, today, zones, currentZoneId, readOnly }: {
  gardenId: string; cultureId: string; stages: Row_[]; today: string; zones: { id: string; label: string }[]; currentZoneId: string; readOnly: boolean;
}) {
  const t = useTranslations('cultureDetail');
  const ts = useTranslations('stages');
  const [warnings, setWarnings] = useState<{ before: Stage; after: Stage }[]>([]);
  const action = useAction(recordStageAction, { onSuccess: (d) => setWarnings(d.warnings) });
  const [targets, setTargets] = useState<Record<string, string>>({});
  if (readOnly) return null;
  return (
    <Stack gap="sm">
      <FormError error={action.error && !Object.keys(action.fieldErrors).length ? action.error : null} />
      {action.fieldErrors.actualOn ? <Alert tone="danger">{t('futureDate')}</Alert> : null}
      {warnings.map((w) => <Alert key={`${w.before}-${w.after}`} tone="warning">{t('orderWarning', { before: ts(w.before), after: ts(w.after) })}</Alert>)}
      {stages.map((s) => {
        const movable = s.stage === 'transplanting' || s.stage === 'planting';
        const target = targets[s.stage] ?? '';
        const run = (patch: { plannedOn?: string | null; actualOn?: string | null }) => void action.run({ gardenId, cultureId, stage: s.stage, ...patch, ...(movable && target ? { targetZoneId: target } : {}) });
        return (
          <fieldset key={s.stage} data-testid={`edit-stage-${s.stage}`} style={{ border: 0, padding: 0 }}>
            <legend><strong>{ts(s.stage)}</strong></legend>
            <Row>
              <label htmlFor={`p-${s.stage}`}>{t('plannedLabel')}</label>
              <TextInput id={`p-${s.stage}`} type="date" defaultValue={s.plannedOn ?? ''} onBlur={(e) => { if (e.target.value !== (s.plannedOn ?? '')) run({ plannedOn: e.target.value || null }); }} />
              <label htmlFor={`a-${s.stage}`}>{t('actualLabel')}</label>
              <TextInput id={`a-${s.stage}`} type="date" max={today} defaultValue={s.actualOn ?? ''} onBlur={(e) => { if (e.target.value !== (s.actualOn ?? '')) run({ actualOn: e.target.value || null }); }} />
              {!s.actualOn ? <Button variant="secondary" onClick={() => run({ actualOn: today })} data-testid={`today-${s.stage}`}>{t('today')}</Button> : null}
            </Row>
            {movable && !s.actualOn ? (
              <Row>
                <label htmlFor={`z-${s.stage}`}>{t('moveTo')}</label>
                <NativeSelect id={`z-${s.stage}`} value={target} onChange={(e) => setTargets((x) => ({ ...x, [s.stage]: e.target.value }))}>
                  <option value="">{t('sameZone')}</option>
                  {zones.filter((z) => z.id !== currentZoneId).map((z) => <option key={z.id} value={z.id}>{z.label}</option>)}
                </NativeSelect>
              </Row>
            ) : null}
          </fieldset>
        );
      })}
    </Stack>
  );
}
