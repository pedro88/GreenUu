'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { ChipGroup, Field, NativeSelect, TextInput } from '@/components/ui/Field';
import { FormError } from '@/components/ui/FormError';
import { Stack } from '@/components/ui/Layout';
import { useAction } from '@/components/ui/useAction';
import { ENVIRONMENTS, ORG_TYPES, type Environment, type OrgType } from '@/lib/enums';
import { updateGardenAction } from '../actions';
import { ContextFields } from './GardenWizard';

export type GardenSettingsValues = {
  name: string; orgType: OrgType; environments: Environment[]; placeLabel: string; lat: string; lng: string; altitudeM: string;
  soilType: string; soilPh: string; exposure: string; waterAccess: string; koppen: string; hardinessZone: string;
  timezone: string; seasonStartMonth: string; planEditMinRole: 'admin' | 'member';
};

export function GardenSettingsForm({ gardenId, initial }: { gardenId: string; initial: GardenSettingsValues }) {
  const t = useTranslations('settings');
  const tf = useTranslations('gardenFields');
  const to = useTranslations('orgTypes');
  const te = useTranslations('environments');
  const tr = useTranslations('roles');
  const [v, setV] = useState(initial);
  const [saved, setSaved] = useState(false);
  const set = <K extends keyof GardenSettingsValues>(k: K, val: GardenSettingsValues[K]) => { setSaved(false); setV((s) => ({ ...s, [k]: val })); };
  const action = useAction(updateGardenAction, { onSuccess: () => setSaved(true) });
  const fe = action.fieldErrors;
  return (
    <form method="post" onSubmit={(e) => { e.preventDefault(); void action.run({ gardenId, ...v }); }} data-testid="garden-settings-form">
      <Stack>
        {saved ? <Alert tone="success">{t('saved')}</Alert> : null}
        <FormError error={action.error && !Object.keys(fe).length ? action.error : null} />
        <Field label={tf('name')} errors={fe.name}>{(p) => <TextInput {...p} name="name" required value={v.name} onChange={(e) => set('name', e.target.value)} />}</Field>
        <Field label={tf('orgType')} errors={fe.orgType}>{(p) => (
          <NativeSelect {...p} value={v.orgType} onChange={(e) => set('orgType', ORG_TYPES.find((o) => o === e.target.value) ?? v.orgType)}>
            {ORG_TYPES.map((o) => <option key={o} value={o}>{to(o)}</option>)}
          </NativeSelect>
        )}</Field>
        <ChipGroup legend={tf('environments')} name="environments" value={v.environments} onChange={(x) => set('environments', x)} errors={fe.environments}
          options={ENVIRONMENTS.map((e) => ({ value: e, label: te(e) }))} />
        <Field label={tf('placeLabel')} errors={fe.placeLabel}>{(p) => <TextInput {...p} value={v.placeLabel} onChange={(e) => set('placeLabel', e.target.value)} />}</Field>
        <Field label={tf('lat')} errors={fe.lat}>{(p) => <TextInput {...p} inputMode="decimal" value={v.lat} onChange={(e) => set('lat', e.target.value)} />}</Field>
        <Field label={tf('lng')} errors={fe.lng}>{(p) => <TextInput {...p} inputMode="decimal" value={v.lng} onChange={(e) => set('lng', e.target.value)} />}</Field>
        <Field label={tf('altitudeM')} errors={fe.altitudeM}>{(p) => <TextInput {...p} inputMode="numeric" value={v.altitudeM} onChange={(e) => set('altitudeM', e.target.value)} />}</Field>
        <ContextFields values={v} onChange={(k, val) => set(k, val)} errors={fe} />
        <Field label={tf('timezone')} errors={fe.timezone}>{(p) => <TextInput {...p} value={v.timezone} onChange={(e) => set('timezone', e.target.value)} />}</Field>
        <Field label={tf('seasonStartMonth')} hint={tf('seasonStartHint')} errors={fe.seasonStartMonth}>{(p) => (
          <NativeSelect {...p} value={v.seasonStartMonth} onChange={(e) => set('seasonStartMonth', e.target.value)}>
            {Array.from({ length: 12 }, (_, i) => <option key={i} value={String(i + 1)}>{new Date(2026, i, 1).toLocaleDateString('fr', { month: 'long' })}</option>)}
          </NativeSelect>
        )}</Field>
        <Field label={tf('planEditMinRole')} hint={tf('planEditHint')}>{(p) => (
          <NativeSelect {...p} value={v.planEditMinRole} onChange={(e) => set('planEditMinRole', e.target.value === 'member' ? 'member' : 'admin')}>
            <option value="admin">{tr('admin')}</option>
            <option value="member">{tr('member')}</option>
          </NativeSelect>
        )}</Field>
        <Button type="submit" size="large" disabled={action.pending}>{t('save')}</Button>
      </Stack>
    </form>
  );
}
