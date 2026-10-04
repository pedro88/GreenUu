'use client';

import { AlertTriangle, Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Checkbox, Field, NativeSelect, TextInput } from '@/components/ui/Field';
import { FormError } from '@/components/ui/FormError';
import { Row, Stack } from '@/components/ui/Layout';
import { PlantIcon } from '@/components/ui/PlantIcon';
import { tDynamic } from '@/i18n/dynamic';
import type { ActionError } from '@/lib/errors';
import { METHODS, type DensityUnit, type Method } from '@/lib/enums';
import { estimatedPlantCount, plantsPerM2 } from '../stages.pure';
import { gardenVarietiesAction, searchPlantsAction } from '../../plant/actions';
import type { PlantSearchHit } from '../../plant/service';
import { createCultureAction, previewCultureAction } from '../actions';
import type { CulturePreview } from '../service';
import styles from './NewCultureWizard.module.scss';

type Choice = { speciesId: string; varietyId: string | null; label: string; spriteKey: string | null; spacing: { plantCm: number | null; rowCm: number | null } };
type DensityMode = 'spacing' | 'density';
const num = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')) || null);

export function NewCultureWizard({ gardenId, zones, initialZoneId, today }: { gardenId: string; zones: { id: string; label: string }[]; initialZoneId: string | null; today: string }) {
  const t = useTranslations('newCulture');
  const tm = useTranslations('methods');
  const tst = useTranslations('stages');
  const tf = useTranslations('families');
  const f = useFormatter();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<PlantSearchHit[]>([]);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [zoneId, setZoneId] = useState(initialZoneId ?? zones[0]?.id ?? '');
  const [method, setMethod] = useState<Method>('bought_plants');
  const [anchorDate, setAnchorDate] = useState(today);
  const [plantCount, setPlantCount] = useState('');
  // Distances ou densité (RG-CUL-06) : pré-remplies avec les distances de l'espèce choisie.
  const [densityMode, setDensityMode] = useState<DensityMode>('spacing');
  const [spacingPlant, setSpacingPlant] = useState('');
  const [spacingRow, setSpacingRow] = useState('');
  const [density, setDensity] = useState('');
  const [densityUnit, setDensityUnit] = useState<DensityUnit>('plants_per_m2');
  const [area, setArea] = useState('');
  const [varieties, setVarieties] = useState<{ id: string; name: string; status: string }[]>([]);
  const [preview, setPreview] = useState<CulturePreview | null>(null);
  const [ack, setAck] = useState(false);
  const [error, setError] = useState<ActionError | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (query.trim().length < 2) return;
    const id = setTimeout(() => start(async () => {
      const r = await searchPlantsAction({ q: query });
      if (r.ok) setHits(r.data);
    }), 250);
    return () => clearTimeout(id);
  }, [query]);

  const pick = (h: PlantSearchHit) => {
    const speciesId = h.kind === 'species' ? h.id : h.speciesId;
    setChoice({ speciesId, varietyId: h.kind === 'variety' ? h.id : null, label: h.kind === 'species' ? h.name : `${h.speciesName} ${h.name}`, spriteKey: h.spriteKey, spacing: h.spacing });
    setSpacingPlant(h.spacing.plantCm ? String(h.spacing.plantCm) : '');
    setSpacingRow(h.spacing.rowCm ? String(h.spacing.rowCm) : '');
    start(async () => {
      const r = await gardenVarietiesAction({ gardenId, speciesId });
      if (r.ok) setVarieties(r.data);
    });
  };

  const toReview = () => start(async () => {
    if (!choice) return;
    const r = await previewCultureAction({ gardenId, zoneId, speciesId: choice.speciesId, method, anchorDate, plannedDates: {} });
    if (r.ok) {
      setPreview(r.data);
      setError(null);
      setStep(3);
    } else setError(r.error);
  });

  const sowing = method === 'direct_sowing';
  const unit: DensityUnit = sowing ? densityUnit : 'plants_per_m2';
  const planting = densityMode === 'spacing'
    ? { spacingPlantCm: num(spacingPlant), spacingRowCm: num(spacingRow), density: null, densityUnit: null }
    : { spacingPlantCm: null, spacingRowCm: unit === 'seeds_per_m' ? num(spacingRow) : null, density: num(density), densityUnit: num(density) ? unit : null };
  const perM2 = plantsPerM2(planting);
  const estimate = estimatedPlantCount(num(area), perM2);

  const create = () => start(async () => {
    if (!choice) return;
    const r = await createCultureAction({
      gardenId, zoneId, speciesId: choice.speciesId, varietyId: choice.varietyId ?? '', method, anchorDate, plantCount, areaM2: area,
      spacingPlantCm: planting.spacingPlantCm ?? '', spacingRowCm: planting.spacingRowCm ?? '', density: planting.density ?? '', densityUnit: planting.densityUnit ?? '',
      seedSource: 'unknown', plannedDates: {}, acknowledgeRotation: ack,
    });
    if (r.ok) router.push(`/app/jardins/${gardenId}/cultures/${r.data.cultureId}`);
    else setError(r.error);
  });

  const fmt = (d: string | null) => (d ? f.dateTime(new Date(`${d}T12:00:00`), { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
  const zoneLabel = zones.find((z) => z.id === zoneId)?.label.replace(/^(— )+/, '') ?? '';

  return (
    <div className={styles.wizard}>
      <span className={styles.step}>{t('stepOf', { step, total: 3 })}</span>
      <div className={styles.progress} aria-hidden><span style={{ width: `${(step / 3) * 100}%` }} /></div>
      <FormError error={error} />

      {step === 1 ? (
        <Stack>
          <h1>{t('whatTitle')}</h1>
          <Field label={t('search')}>{(p) => (
            <TextInput {...p} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('searchPlaceholder')} autoFocus data-testid="plant-search" />
          )}</Field>
          {pending && hits.length === 0 ? <span aria-live="polite"><Search aria-hidden size={16} /> {t('searching')}</span> : null}
          <ul className={styles.results} aria-label={t('results')}>
            {hits.map((h) => (
              <li key={`${h.kind}-${h.id}`}>
                <button type="button" className={styles.result} aria-pressed={choice?.speciesId === (h.kind === 'species' ? h.id : h.speciesId) && choice.varietyId === (h.kind === 'variety' ? h.id : null)} onClick={() => pick(h)} data-testid={`hit-${h.kind}-${h.name}`}>
                  <PlantIcon spriteKey={h.spriteKey} />
                  <span>
                    <strong>{h.kind === 'species' ? h.name : `${h.speciesName} ${h.name}`}</strong>
                    <br />
                    <small>{h.kind === 'species' ? h.latinName : h.status === 'approved' ? t('variety') : t('varietyPending')}</small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <Button size="large" block disabled={!choice} onClick={() => setStep(2)}>{t('next')}</Button>
        </Stack>
      ) : null}

      {step === 2 && choice ? (
        <Stack>
          <h1>{t('howTitle', { plant: choice.label })}</h1>
          <Field label={t('zone')}>{(p) => (
            <NativeSelect {...p} value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
              {zones.map((z) => <option key={z.id} value={z.id}>{z.label}</option>)}
            </NativeSelect>
          )}</Field>
          <Field label={t('method')}>{(p) => (
            <NativeSelect {...p} value={method} onChange={(e) => setMethod(METHODS.find((m) => m === e.target.value) ?? method)}>
              {METHODS.map((m) => <option key={m} value={m}>{tm(m)}</option>)}
            </NativeSelect>
          )}</Field>
          <Field label={method === 'direct_sowing' || method === 'tray_sowing' ? t('sowingDate') : t('plantingDate')}>{(p) => (
            <TextInput {...p} type="date" value={anchorDate} onChange={(e) => setAnchorDate(e.target.value)} />
          )}</Field>
          <Field label={t('varietyLabel')}>{(p) => (
            <NativeSelect {...p} value={choice.varietyId ?? ''} onChange={(e) => setChoice({ ...choice, varietyId: e.target.value || null })}>
              <option value="">{t('noVariety')}</option>
              {varieties.map((v) => <option key={v.id} value={v.id}>{v.status === 'approved' ? v.name : `${v.name} (${t('pending')})`}</option>)}
            </NativeSelect>
          )}</Field>
          <Link href={`/app/plantes/proposer?espece=${choice.speciesId}&jardin=${gardenId}`}>{t('proposeVariety')}</Link>
          <fieldset className={styles.density} data-testid="planting-density">
            <legend>{sowing ? t('densitySowingTitle') : t('densityPlantingTitle')}</legend>
            <Field label={t('densityMode')}>{(p) => (
              <NativeSelect {...p} value={densityMode} onChange={(e) => setDensityMode(e.target.value === 'density' ? 'density' : 'spacing')} data-testid="density-mode">
                <option value="spacing">{t('densityModeSpacing')}</option>
                <option value="density">{t('densityModeDensity')}</option>
              </NativeSelect>
            )}</Field>
            {densityMode === 'spacing' ? (
              <Row>
                <Field label={t('spacingPlant')} hint={choice.spacing.plantCm ? t('speciesDefault', { cm: choice.spacing.plantCm }) : undefined}>{(p) => <TextInput {...p} inputMode="numeric" value={spacingPlant} onChange={(e) => setSpacingPlant(e.target.value)} data-testid="spacing-plant" />}</Field>
                <Field label={t('spacingRow')} hint={choice.spacing.rowCm ? t('speciesDefault', { cm: choice.spacing.rowCm }) : undefined}>{(p) => <TextInput {...p} inputMode="numeric" value={spacingRow} onChange={(e) => setSpacingRow(e.target.value)} data-testid="spacing-row" />}</Field>
              </Row>
            ) : (
              <Row>
                <Field label={unit === 'seeds_per_m' ? t('densitySeedsPerM') : t('densityPlantsPerM2')}>{(p) => <TextInput {...p} inputMode="decimal" value={density} onChange={(e) => setDensity(e.target.value)} data-testid="density" />}</Field>
                {sowing ? (
                  <Field label={t('densityUnit')}>{(p) => (
                    <NativeSelect {...p} value={densityUnit} onChange={(e) => setDensityUnit(e.target.value === 'seeds_per_m' ? 'seeds_per_m' : 'plants_per_m2')} data-testid="density-unit">
                      <option value="plants_per_m2">{t('unit_plants_per_m2')}</option>
                      <option value="seeds_per_m">{t('unit_seeds_per_m')}</option>
                    </NativeSelect>
                  )}</Field>
                ) : null}
                {unit === 'seeds_per_m' ? <Field label={t('spacingRow')}>{(p) => <TextInput {...p} inputMode="numeric" value={spacingRow} onChange={(e) => setSpacingRow(e.target.value)} data-testid="spacing-row" />}</Field> : null}
              </Row>
            )}
            <Field label={t('area')} hint={t('areaHint')}>{(p) => <TextInput {...p} inputMode="decimal" value={area} onChange={(e) => setArea(e.target.value)} data-testid="culture-area" />}</Field>
            <p role="status" data-testid="density-estimate">
              {estimate !== null ? t('estimatePlants', { n: estimate }) : perM2 !== null ? t('estimatePerM2', { n: f.number(perM2, { maximumFractionDigits: 1 }) }) : t('estimateNone')}
            </p>
          </fieldset>
          <Field label={t('plantCount')} hint={estimate !== null ? t('plantCountEstimated', { n: estimate }) : t('plantCountHint')}>{(p) => <TextInput {...p} inputMode="numeric" value={plantCount} placeholder={estimate !== null ? String(estimate) : undefined} onChange={(e) => setPlantCount(e.target.value)} data-testid="plant-count" />}</Field>
          <Row>
            <Button variant="secondary" onClick={() => setStep(1)}>{t('back')}</Button>
            <Button variant="earth" size="large" onClick={toReview} disabled={pending || !zoneId || !anchorDate}>{t('check')}</Button>
          </Row>
        </Stack>
      ) : null}

      {step === 3 && choice && preview ? (
        <Stack>
          <h1>{t('reviewTitle')}</h1>
          <Row><PlantIcon spriteKey={choice.spriteKey} size={64} /><p><strong>{choice.label}</strong><br />{t('reviewLine', { zone: zoneLabel, season: preview.seasonYear, method: tm(method) })}</p></Row>
          {!preview.zoneCanHostCultures ? <div className={styles.warning} role="alert"><AlertTriangle aria-hidden />{t('zoneCannotHost')}</div> : null}
          {preview.rotation ? (
            <div className={styles.warning} role="alert" data-testid="rotation-warning">
              <AlertTriangle aria-hidden />
              <span>
                <strong>{t('rotationTitle')}</strong> {t('rotationText', {
                  family: tDynamic(tf, preview.rotation.familyCode, preview.rotation.familyCode),
                  year: preview.rotation.lastYear, returnYears: preview.rotation.returnYears, returnYear: preview.rotation.returnYear,
                  cultures: preview.rotation.cultures.map((c) => `${c.label} (${c.zoneName})`).join(', '),
                })}
              </span>
            </div>
          ) : null}
          {preview.companions.map((c) => (
            <div key={c.cultureId} className={styles.warning} role={c.effect === 'unfavorable' ? 'alert' : 'status'} data-testid={`companion-${c.effect}`}>
              {t(c.effect === 'unfavorable' ? 'companionBad' : 'companionGood', { species: c.speciesName, zone: c.zoneName })}
            </div>
          ))}
          <h2>{t('plannedDates')}</h2>
          <ul className={styles.stages}>
            {preview.stages.map((s) => <li key={s.stage}><strong>{tst(s.stage)}</strong><br />{fmt(s.plannedOn)}</li>)}
          </ul>
          {preview.rotation ? <Checkbox label={t('ackRotation')} checked={ack} onChange={(e) => setAck(e.target.checked)} data-testid="ack-rotation" /> : null}
          <Row>
            <Button variant="secondary" onClick={() => setStep(2)}>{t('back')}</Button>
            <Button variant="earth" size="large" onClick={create} disabled={pending || !preview.zoneCanHostCultures || (preview.rotation !== null && !ack)} data-testid="create-culture">{t('create')}</Button>
          </Row>
        </Stack>
      ) : null}
    </div>
  );
}
