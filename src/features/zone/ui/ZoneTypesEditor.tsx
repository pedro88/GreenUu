'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Checkbox, Field, TextInput } from '@/components/ui/Field';
import { FormError } from '@/components/ui/FormError';
import { Row, Stack } from '@/components/ui/Layout';
import { useAction } from '@/components/ui/useAction';
import { archiveZoneTypeAction, createZoneTypeAction } from '../actions';

export function ZoneTypesEditor({ gardenId, custom }: { gardenId: string; custom: { id: string; label: string }[] }) {
  const t = useTranslations('zoneTypesEditor');
  const [label, setLabel] = useState('');
  const [canHostCultures, setCanHost] = useState(true);
  const create = useAction(createZoneTypeAction, { onSuccess: () => setLabel('') });
  const archive = useAction(archiveZoneTypeAction);
  return (
    <Stack>
      {custom.length > 0 ? (
        <ul>{custom.map((c) => (
          <li key={c.id}><Row><span>{c.label}</span><Button variant="ghost" onClick={() => void archive.run({ gardenId, zoneTypeId: c.id })}>{t('archive')}</Button></Row></li>
        ))}</ul>
      ) : <p>{t('none')}</p>}
      <form method="post" onSubmit={(e) => { e.preventDefault(); void create.run({ gardenId, label, canHostCultures, hasInteriorDefault: false }); }}>
        <Stack gap="sm">
          <FormError error={create.error && !Object.keys(create.fieldErrors).length ? create.error : null} />
          <Field label={t('label')} errors={create.fieldErrors.label}>{(p) => <TextInput {...p} value={label} onChange={(e) => setLabel(e.target.value)} />}</Field>
          <Checkbox label={t('canHostCultures')} checked={canHostCultures} onChange={(e) => setCanHost(e.target.checked)} />
          <Row><Button variant="secondary" type="submit" disabled={create.pending || label.trim().length < 2}>{t('add')}</Button></Row>
        </Stack>
      </form>
    </Stack>
  );
}
