'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Checkbox, Field, NativeSelect, TextArea, TextInput } from '@/components/ui/Field';
import { FormError } from '@/components/ui/FormError';
import { Stack } from '@/components/ui/Layout';
import { useAction } from '@/components/ui/useAction';
import { ENVIRONMENTS } from '@/lib/enums';
import { createZoneAction, updateZoneAction } from '../actions';
import { useZoneTypeLabel } from './zoneLabels';

export type ZoneTypeOption = { id: string; code: string; label: string; isCustom: boolean; hasInteriorDefault: boolean };
export type ZoneFormValues = {
  name: string; zoneTypeId: string; environment: string; lengthCm: string; widthCm: string; surfaceM2Manual: string; hasInterior: boolean; notes: string;
};

/** Création (parentId optionnel) ou modification d'une zone. */
export function ZoneForm({ gardenId, parentId, zoneId, types, initial, onDone }: {
  gardenId: string; parentId?: string | null; zoneId?: string; types: ZoneTypeOption[]; initial?: ZoneFormValues; onDone?: (zoneId: string) => void;
}) {
  const t = useTranslations('zones');
  const te = useTranslations('environments');
  const typeLabel = useZoneTypeLabel();
  const [v, setV] = useState<ZoneFormValues>(initial ?? { name: '', zoneTypeId: types[0]?.id ?? '', environment: '', lengthCm: '', widthCm: '', surfaceM2Manual: '', hasInterior: false, notes: '' });
  const set = <K extends keyof ZoneFormValues>(k: K, val: ZoneFormValues[K]) => setV((s) => ({ ...s, [k]: val }));
  const create = useAction(createZoneAction, { onSuccess: (d) => onDone?.(d.zoneId) });
  const update = useAction(updateZoneAction, { onSuccess: (d) => onDone?.(d.zoneId) });
  const action = zoneId ? update : create;
  const fe = action.fieldErrors;
  const submit = () => {
    const common = { gardenId, name: v.name, zoneTypeId: v.zoneTypeId, environment: v.environment, lengthCm: v.lengthCm, widthCm: v.widthCm, surfaceM2Manual: v.surfaceM2Manual, hasInterior: v.hasInterior, notes: v.notes, geometry: null };
    if (zoneId) void update.run({ ...common, zoneId });
    else void create.run({ ...common, parentId: parentId ?? null });
  };
  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(); }} data-testid="zone-form">
      <Stack>
        <FormError error={action.error && !Object.keys(fe).length ? action.error : null} />
        <Field label={t('name')} errors={fe.name}>{(p) => <TextInput {...p} name="name" required value={v.name} onChange={(e) => set('name', e.target.value)} />}</Field>
        <Field label={t('type')} errors={fe.zoneTypeId}>{(p) => (
          <NativeSelect {...p} name="zoneTypeId" value={v.zoneTypeId} onChange={(e) => {
            const type = types.find((x) => x.id === e.target.value);
            setV((s) => ({ ...s, zoneTypeId: e.target.value, hasInterior: type?.hasInteriorDefault ?? s.hasInterior }));
          }}>
            {types.map((ty) => <option key={ty.id} value={ty.id}>{typeLabel(ty)}</option>)}
          </NativeSelect>
        )}</Field>
        <Field label={t('environment')} hint={t('environmentHint')} errors={fe.environment}>{(p) => (
          <NativeSelect {...p} name="environment" value={v.environment} onChange={(e) => set('environment', e.target.value)}>
            <option value="">{t('inherited')}</option>
            {ENVIRONMENTS.map((env) => <option key={env} value={env}>{te(env)}</option>)}
          </NativeSelect>
        )}</Field>
        <Field label={t('lengthCm')} errors={fe.lengthCm}>{(p) => <TextInput {...p} name="lengthCm" inputMode="numeric" value={v.lengthCm} onChange={(e) => set('lengthCm', e.target.value)} />}</Field>
        <Field label={t('widthCm')} errors={fe.widthCm}>{(p) => <TextInput {...p} name="widthCm" inputMode="numeric" value={v.widthCm} onChange={(e) => set('widthCm', e.target.value)} />}</Field>
        <Field label={t('surfaceManual')} hint={t('surfaceHint')} errors={fe.surfaceM2Manual}>{(p) => <TextInput {...p} name="surfaceM2Manual" inputMode="decimal" value={v.surfaceM2Manual} onChange={(e) => set('surfaceM2Manual', e.target.value)} />}</Field>
        <Checkbox label={t('hasInterior')} checked={v.hasInterior} onChange={(e) => set('hasInterior', e.target.checked)} />
        <Field label={t('notes')} errors={fe.notes}>{(p) => <TextArea {...p} name="notes" value={v.notes} onChange={(e) => set('notes', e.target.value)} />}</Field>
        <Button type="submit" size="large" block disabled={action.pending || !v.name.trim()}>{zoneId ? t('save') : t('create')}</Button>
      </Stack>
    </form>
  );
}
