'use client';

import { tDynamic } from '@/i18n/dynamic';
import { ArrowLeft, Check, LocateFixed } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { PixelIcon } from '@/components/ui/PlantIcon';
import { Button } from '@/components/ui/Button';
import { ChipGroup, Field, NativeSelect, TextInput } from '@/components/ui/Field';
import { FormError } from '@/components/ui/FormError';
import { Stack } from '@/components/ui/Layout';
import type { ActionError, FieldErrors } from '@/lib/errors';
import { ENVIRONMENTS, EXPOSURES, ORG_TYPES, SOIL_TYPES, WATER_ACCESS } from '@/lib/enums';
import { setPracticesAction } from '../../practice/actions';
import { createGardenAction } from '../actions';
import { KOPPEN_CODES } from '../koppen';
import styles from './GardenWizard.module.scss';

type OrgType = (typeof ORG_TYPES)[number];
type Env = (typeof ENVIRONMENTS)[number];

/** Illustrations pixel art des types de jardin (sprites HD, cf. scripts/nav-icons.py). */
const ORG_ART: Record<OrgType, string> = {
  individual: 'nav/profil', family: 'ui/groupe', collective: 'ui/competence-potager', association: 'art/table-chaises', professional: 'art/tracteur', educational: 'nav/savoirs',
};

type WizardValues = {
  orgType: OrgType; environments: Env[]; name: string; placeLabel: string; lat: string; lng: string; altitudeM: string;
  soilType: string; soilPh: string; exposure: string; waterAccess: string; koppen: string; hardinessZone: string; practices: string[];
};

const STEP_FIELDS: Record<number, string[]> = {
  1: ['orgType', 'environments'],
  2: ['name', 'lat', 'lng', 'placeLabel', 'altitudeM', 'timezone'],
  3: ['soilType', 'soilPh', 'exposure', 'waterAccess', 'koppen', 'hardinessZone'],
};

export function GardenWizard({ practices }: { practices: { code: string }[] }) {
  const t = useTranslations('wizard');
  const tf = useTranslations('gardenFields');
  const to = useTranslations('orgTypes');
  const te = useTranslations('environments');
  const tp = useTranslations('practices');
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ActionError | null>(null);
  const [geoError, setGeoError] = useState(false);
  const [v, setV] = useState<WizardValues>({
    orgType: 'family', environments: ['open_air'], name: '', placeLabel: '', lat: '', lng: '', altitudeM: '',
    soilType: 'unknown', soilPh: '', exposure: '', waterAccess: '', koppen: '', hardinessZone: '', practices: [],
  });
  const set = <K extends keyof WizardValues>(k: K, value: WizardValues[K]) => setV((s) => ({ ...s, [k]: value }));
  const fe: FieldErrors = error?.fieldErrors ?? {};
  const total = 4;

  const locate = () => {
    setGeoError(false);
    navigator.geolocation.getCurrentPosition(
      (pos) => setV((s) => ({ ...s, lat: pos.coords.latitude.toFixed(5), lng: pos.coords.longitude.toFixed(5), altitudeM: pos.coords.altitude ? String(Math.round(pos.coords.altitude)) : s.altitudeM })),
      () => setGeoError(true),
      { enableHighAccuracy: false, timeout: 10_000 },
    );
  };

  const submit = async () => {
    setPending(true);
    const created = await createGardenAction({
      name: v.name, orgType: v.orgType, environments: v.environments, lat: v.lat, lng: v.lng, placeLabel: v.placeLabel, altitudeM: v.altitudeM,
      soilType: v.soilType, soilPh: v.soilPh, exposure: v.exposure, waterAccess: v.waterAccess, koppen: v.koppen, hardinessZone: v.hardinessZone,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    if (!created.ok) {
      setPending(false);
      setError(created.error);
      const firstBad = Object.keys(created.error.fieldErrors ?? {})[0];
      const target = Object.entries(STEP_FIELDS).find(([, fields]) => firstBad && fields.includes(firstBad));
      if (target) setStep(Number(target[0]));
      return;
    }
    if (v.practices.length > 0) await setPracticesAction({ gardenId: created.data.gardenId, zoneId: null, declared: v.practices, excluded: [] });
    router.push(`/app/jardins/${created.data.gardenId}/zones?nouveau=1`);
  };

  const canContinue = step === 1 ? v.environments.length > 0 : step === 2 ? v.name.trim().length >= 2 && v.lat !== '' && v.lng !== '' : true;

  return (
    <form className={styles.wizard} onSubmit={(e) => { e.preventDefault(); if (step < total) setStep(step + 1); else void submit(); }}>
      <div className={styles.progressRow}>
        <button type="button" className={styles.back} onClick={() => (step > 1 ? setStep(step - 1) : router.back())} aria-label={t('back')}><ArrowLeft /></button>
        <div className={styles.progress} role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={step} aria-label={t('progress')}>
          <div className={styles.progressFill} style={{ width: `${(step / total) * 100}%` }} />
        </div>
        <span>{step} / {total}</span>
      </div>
      <FormError error={error && !Object.keys(fe).length ? error : null} />

      {step === 1 ? (
        <Stack>
          <h1 className={styles.title}>{t('typeTitle')}</h1>
          <div className={styles.typeGrid} role="radiogroup" aria-label={t('typeTitle')}>
            {ORG_TYPES.map((o) => {
              return (
                <label key={o} className={styles.typeCard} data-testid={`org-${o}`}>
                  <input type="radio" name="orgType" value={o} checked={v.orgType === o} onChange={() => set('orgType', o)} />
                  <span className={styles.typeArt} aria-hidden><PixelIcon name={ORG_ART[o]} size={64} /></span>
                  {to(o)}
                  {v.orgType === o ? <span className={styles.check} aria-hidden><Check size={18} /></span> : null}
                </label>
              );
            })}
          </div>
          <ChipGroup legend={t('envTitle')} name="environments" value={v.environments} onChange={(x) => set('environments', x)} errors={fe.environments}
            options={ENVIRONMENTS.map((e) => ({ value: e, label: te(e) }))} />
        </Stack>
      ) : null}

      {step === 2 ? (
        <Stack>
          <h1 className={styles.title}>{t('placeTitle')}</h1>
          <Field label={tf('name')} errors={fe.name}>{(p) => <TextInput {...p} name="name" required value={v.name} onChange={(e) => set('name', e.target.value)} />}</Field>
          <Field label={tf('placeLabel')} hint={tf('placeLabelHint')} errors={fe.placeLabel}>{(p) => <TextInput {...p} name="placeLabel" value={v.placeLabel} onChange={(e) => set('placeLabel', e.target.value)} />}</Field>
          <Button variant="secondary" onClick={locate}><LocateFixed aria-hidden />{t('useMyPosition')}</Button>
          {geoError ? <span role="alert">{t('geoError')}</span> : null}
          <div className={styles.twoCols}>
            <Field label={tf('lat')} errors={fe.lat}>{(p) => <TextInput {...p} name="lat" inputMode="decimal" required value={v.lat} onChange={(e) => set('lat', e.target.value)} />}</Field>
            <Field label={tf('lng')} errors={fe.lng}>{(p) => <TextInput {...p} name="lng" inputMode="decimal" required value={v.lng} onChange={(e) => set('lng', e.target.value)} />}</Field>
          </div>
          <Field label={tf('altitudeM')} errors={fe.altitudeM}>{(p) => <TextInput {...p} name="altitudeM" inputMode="numeric" value={v.altitudeM} onChange={(e) => set('altitudeM', e.target.value)} />}</Field>
          <p>{t('privacyNote')}</p>
        </Stack>
      ) : null}

      {step === 3 ? (
        <Stack>
          <h1 className={styles.title}>{t('contextTitle')}</h1>
          <ContextFields values={v} onChange={(k, val) => set(k, val)} errors={fe} />
        </Stack>
      ) : null}

      {step === 4 ? (
        <Stack>
          <h1 className={styles.title}>{t('practicesTitle')}</h1>
          <ChipGroup legend={t('practicesLegend')} name="practices" value={v.practices} onChange={(x) => set('practices', x)}
            options={practices.map((p) => ({ value: p.code, label: tDynamic(tp, p.code, p.code) }))} />
        </Stack>
      ) : null}

      <Button type="submit" size="large" block disabled={!canContinue || pending} data-testid="wizard-continue">
        {step < total ? t('continue') : t('create')}
      </Button>
    </form>
  );
}

type ContextValues = { soilType: string; soilPh: string; exposure: string; waterAccess: string; koppen: string; hardinessZone: string };

/** Champs de contexte, partagés avec la page Paramètres du jardin. */
export function ContextFields<T extends ContextValues>({ values, onChange, errors }: { values: T; onChange: (k: keyof ContextValues, v: string) => void; errors: FieldErrors }) {
  const tf = useTranslations('gardenFields');
  const ts = useTranslations('soilTypes');
  const tx = useTranslations('exposures');
  const tw = useTranslations('waterAccess');
  return (
    <>
      <Field label={tf('soilType')} errors={errors.soilType}>{(p) => (
        <NativeSelect {...p} name="soilType" value={values.soilType} onChange={(e) => onChange('soilType', e.target.value)}>
          {SOIL_TYPES.map((s) => <option key={s} value={s}>{ts(s)}</option>)}
        </NativeSelect>
      )}</Field>
      <Field label={tf('soilPh')} hint={tf('soilPhHint')} errors={errors.soilPh}>{(p) => <TextInput {...p} name="soilPh" inputMode="decimal" value={values.soilPh} onChange={(e) => onChange('soilPh', e.target.value)} />}</Field>
      <Field label={tf('exposure')} errors={errors.exposure}>{(p) => (
        <NativeSelect {...p} name="exposure" value={values.exposure} onChange={(e) => onChange('exposure', e.target.value)}>
          <option value="">{tf('unknown')}</option>
          {EXPOSURES.map((s) => <option key={s} value={s}>{tx(s)}</option>)}
        </NativeSelect>
      )}</Field>
      <Field label={tf('waterAccess')} errors={errors.waterAccess}>{(p) => (
        <NativeSelect {...p} name="waterAccess" value={values.waterAccess} onChange={(e) => onChange('waterAccess', e.target.value)}>
          <option value="">{tf('unknown')}</option>
          {WATER_ACCESS.map((s) => <option key={s} value={s}>{tw(s)}</option>)}
        </NativeSelect>
      )}</Field>
      <Field label={tf('koppen')} hint={tf('koppenHint')} errors={errors.koppen}>{(p) => (
        <NativeSelect {...p} name="koppen" value={values.koppen} onChange={(e) => onChange('koppen', e.target.value)}>
          <option value="">{tf('unknown')}</option>
          {KOPPEN_CODES.map((k) => <option key={k} value={k}>{k}</option>)}
        </NativeSelect>
      )}</Field>
      <Field label={tf('hardinessZone')} hint={tf('hardinessHint')} errors={errors.hardinessZone}>{(p) => <TextInput {...p} name="hardinessZone" value={values.hardinessZone} onChange={(e) => onChange('hardinessZone', e.target.value)} />}</Field>
    </>
  );
}
