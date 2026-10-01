'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { NativeSelect } from '@/components/ui/Field';
import { FormError } from '@/components/ui/FormError';
import { Row } from '@/components/ui/Layout';
import { useAction } from '@/components/ui/useAction';
import { moderateVarietyAction } from '../actions';

export function ModerationRow({ varietyId, label, mergeTargets }: { varietyId: string; label: string; mergeTargets: { id: string; name: string }[] }) {
  const t = useTranslations('moderation');
  const [target, setTarget] = useState(mergeTargets[0]?.id ?? '');
  const action = useAction(moderateVarietyAction);
  return (
    <li data-testid={`pending-${label}`}>
      <Row>
        <strong>{label}</strong>
        <Button variant="secondary" disabled={action.pending} onClick={() => void action.run({ varietyId, decision: 'approve' })}>{t('approve')}</Button>
        <Button variant="secondary" disabled={action.pending} onClick={() => void action.run({ varietyId, decision: 'reject' })}>{t('reject')}</Button>
        {mergeTargets.length > 0 ? (
          <>
            <label className="visually-hidden" htmlFor={`merge-${varietyId}`}>{t('mergeInto')}</label>
            <NativeSelect id={`merge-${varietyId}`} value={target} onChange={(e) => setTarget(e.target.value)}>
              {mergeTargets.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </NativeSelect>
            <Button variant="secondary" disabled={action.pending || !target} onClick={() => void action.run({ varietyId, decision: 'merge', targetId: target })}>{t('merge')}</Button>
          </>
        ) : null}
      </Row>
      <FormError error={action.error} />
    </li>
  );
}
