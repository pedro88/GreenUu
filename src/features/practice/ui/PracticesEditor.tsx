'use client';

import { tDynamic } from '@/i18n/dynamic';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { ChipGroup } from '@/components/ui/Field';
import { FormError } from '@/components/ui/FormError';
import { Row, Stack } from '@/components/ui/Layout';
import { useAction } from '@/components/ui/useAction';
import { setPracticesAction } from '../actions';

/** Pratiques déclarées au niveau du jardin (zoneId null) ou d'une zone, avec exclusions héritées. */
export function PracticesEditor({ gardenId, zoneId, catalog, declared, excluded, inherited, readOnly }: {
  gardenId: string; zoneId: string | null; catalog: string[]; declared: string[]; excluded: string[]; inherited: string[]; readOnly: boolean;
}) {
  const t = useTranslations('practicesEditor');
  const tp = useTranslations('practices');
  const [d, setD] = useState(declared);
  const [x, setX] = useState(excluded);
  const [saved, setSaved] = useState(false);
  const action = useAction(setPracticesAction, { onSuccess: () => setSaved(true) });
  const label = (code: string) => tDynamic(tp, code, code);
  if (readOnly) {
    const eff = [...new Set([...inherited.filter((c) => !x.includes(c)), ...d])];
    return <p>{eff.length ? eff.map(label).join(', ') : t('none')}</p>;
  }
  const inheritedActive = inherited.filter((c) => !d.includes(c));
  return (
    <Stack gap="sm">
      <FormError error={action.error} />
      {saved ? <Alert tone="success">{t('saved')}</Alert> : null}
      <ChipGroup legend={zoneId ? t('declaredHere') : t('declaredGarden')} name="declared" value={d} onChange={(v) => { setSaved(false); setD(v); }}
        options={catalog.filter((c) => !inheritedActive.includes(c)).map((c) => ({ value: c, label: label(c) }))} />
      {zoneId && inheritedActive.length > 0 ? (
        <ChipGroup legend={t('excludeInherited')} name="excluded" value={x} onChange={(v) => { setSaved(false); setX(v); }}
          options={inheritedActive.map((c) => ({ value: c, label: label(c) }))} />
      ) : null}
      <Row><Button variant="secondary" disabled={action.pending} onClick={() => void action.run({ gardenId, zoneId, declared: d, excluded: zoneId ? x : [] })}>{t('save')}</Button></Row>
    </Stack>
  );
}
