'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Field, NativeSelect, TextArea, TextInput } from '@/components/ui/Field';
import { FormError } from '@/components/ui/FormError';
import { Stack } from '@/components/ui/Layout';
import { useAction } from '@/components/ui/useAction';
import { VARIETY_ORIGINS } from '@/lib/enums';
import { proposeVarietyAction } from '../actions';

export function ProposeVarietyForm({ species, gardens, initialSpeciesId, initialGardenId }: {
  species: { id: string; label: string }[]; gardens: { id: string; name: string }[]; initialSpeciesId: string | null; initialGardenId: string | null;
}) {
  const t = useTranslations('plants');
  const [speciesId, setSpeciesId] = useState(initialSpeciesId ?? species[0]?.id ?? '');
  const [gardenId, setGardenId] = useState(initialGardenId ?? gardens[0]?.id ?? '');
  const [name, setName] = useState('');
  const [origin, setOrigin] = useState<(typeof VARIETY_ORIGINS)[number]>('local');
  const [description, setDescription] = useState('');
  const [sent, setSent] = useState(false);
  const action = useAction(proposeVarietyAction, { onSuccess: () => { setSent(true); setName(''); setDescription(''); } });
  if (gardens.length === 0) return <Alert tone="info">{t('proposeNeedsGarden')}</Alert>;
  return (
    <form onSubmit={(e) => { e.preventDefault(); void action.run({ speciesId, gardenId, name, origin, description }); }}>
      <Stack>
        {sent ? <Alert tone="success"><span data-testid="propose-sent">{t('proposeSent')}</span></Alert> : null}
        <FormError error={action.error && !Object.keys(action.fieldErrors).length ? action.error : null} />
        <Field label={t('species')}>{(p) => (
          <NativeSelect {...p} value={speciesId} onChange={(e) => setSpeciesId(e.target.value)}>
            {species.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </NativeSelect>
        )}</Field>
        <Field label={t('varietyName')} errors={action.fieldErrors.name}>{(p) => <TextInput {...p} required value={name} onChange={(e) => setName(e.target.value)} />}</Field>
        <Field label={t('origin')}>{(p) => (
          <NativeSelect {...p} value={origin} onChange={(e) => setOrigin(VARIETY_ORIGINS.find((o) => o === e.target.value) ?? origin)}>
            {VARIETY_ORIGINS.map((o) => <option key={o} value={o}>{t(`origin_${o}`)}</option>)}
          </NativeSelect>
        )}</Field>
        <Field label={t('garden')} hint={t('gardenHint')}>{(p) => (
          <NativeSelect {...p} value={gardenId} onChange={(e) => setGardenId(e.target.value)}>
            {gardens.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </NativeSelect>
        )}</Field>
        <Field label={t('description')}>{(p) => <TextArea {...p} value={description} onChange={(e) => setDescription(e.target.value)} />}</Field>
        <Button type="submit" size="large" disabled={action.pending || name.trim().length < 2}>{t('proposeSubmit')}</Button>
      </Stack>
    </form>
  );
}
