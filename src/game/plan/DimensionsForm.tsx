'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Field, NativeSelect, TextInput } from '@/components/ui/Field';
import type { SceneZone } from '@/features/scene/snapshot.schema';
import type { RectGeometry } from '@/features/zone/tree';
import styles from '../GardenView.module.scss';

export type ZoneTypeOption = { id: string; code: string; label: string; isCustom: boolean; hasInteriorDefault: boolean; canHostCultures: boolean };

/** Formulaire alternatif (§9.6, PLN-02) : produit la même commande que le dessin à la souris. */
export function DimensionsForm({ zones, types, typeLabel, defaultType, onSubmit }: {
  zones: SceneZone[]; types: ZoneTypeOption[]; typeLabel: (z: ZoneTypeOption) => string; defaultType: string;
  onSubmit: (v: { name: string; zoneTypeId: string; parentId: string | null; geometry: RectGeometry }) => boolean;
}) {
  const t = useTranslations('plan');
  const [v, setV] = useState({ name: '', zoneTypeId: defaultType, parentId: '', x: 0, y: 0, w: 100, h: 100 });
  const num = (key: 'x' | 'y' | 'w' | 'h', label: string) => (
    <Field label={label}>{(p) => <TextInput {...p} inputMode="numeric" value={v[key]} onChange={(e) => setV({ ...v, [key]: Number(e.target.value) || 0 })} data-testid={`dims-${key}`} />}</Field>
  );
  return (
    <form method="post" className={styles.drawer} data-testid="zone-form-dims" onSubmit={(e) => {
      e.preventDefault();
      if (onSubmit({ name: v.name.trim() || typeLabel(types.find((x) => x.id === v.zoneTypeId) ?? { id: '', code: '', label: '', isCustom: true, hasInteriorDefault: false, canHostCultures: true }), zoneTypeId: v.zoneTypeId, parentId: v.parentId || null, geometry: { v: 1, kind: 'rect', x: v.x, y: v.y, w: v.w, h: v.h } })) setV({ ...v, name: '' });
    }}>
      <h2>{t('dimsTitle')}</h2>
      <div className={styles.dims}>
        <Field label={t('dimsName')}>{(p) => <TextInput {...p} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} data-testid="dims-name" />}</Field>
        <Field label={t('zoneType')}>{(p) => (
          <NativeSelect {...p} value={v.zoneTypeId} onChange={(e) => setV({ ...v, zoneTypeId: e.target.value })} data-testid="dims-type">
            {types.map((z) => <option key={z.id} value={z.id}>{typeLabel(z)}</option>)}
          </NativeSelect>
        )}</Field>
        <Field label={t('dimsParent')}>{(p) => (
          <NativeSelect {...p} value={v.parentId} onChange={(e) => setV({ ...v, parentId: e.target.value })} data-testid="dims-parent">
            <option value="">{t('dimsNoParent')}</option>
            {zones.map((z) => <option key={z.id} value={z.id}>{z.label}</option>)}
          </NativeSelect>
        )}</Field>
        {num('x', t('dimsX'))}{num('y', t('dimsY'))}{num('w', t('dimsW'))}{num('h', t('dimsH'))}
        <Button type="submit" data-testid="dims-submit">{t('dimsSubmit')}</Button>
      </div>
    </form>
  );
}
