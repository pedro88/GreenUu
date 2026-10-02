'use client';

import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field, NativeSelect, TextArea, TextInput } from '@/components/ui/Field';
import { FormError } from '@/components/ui/FormError';
import { Stack } from '@/components/ui/Layout';
import { PixelIcon } from '@/components/ui/PlantIcon';
import { useAction } from '@/components/ui/useAction';
import { tDynamic } from '@/i18n/dynamic';
import { uploadPhoto } from '@/lib/client/compress-image';
import { HARVEST_UNITS, type HarvestUnit } from '@/lib/enums';
import type { ActionError } from '@/lib/errors';
import { recordHarvestAction } from '../../harvest/actions';
import { createJournalEntryAction } from '../../journal/actions';
import styles from './QuickCapture.module.scss';

type Mode = 'observation' | 'photo' | 'watering' | 'harvest';

const QUALITY = [{ v: 3, key: 'qualityAverage' }, { v: 4, key: 'qualityGood' }, { v: 5, key: 'qualityExcellent' }] as const;

/**
 * Saisie rapide (maquette « saisie rapide », NFR-03) : 1 tap pour ouvrir, 1 tap pour choisir,
 * au plus 3 champs obligatoires (récolte : quantité, unité ; date pré-remplie).
 */
export function QuickCapture({ gardenId, cultureId, title, problems, triggerClassName }: {
  gardenId: string; cultureId: string; title: string; problems: { code: string; category: string }[]; triggerClassName?: string | undefined;
}) {
  const t = useTranslations('quick');
  const tp = useTranslations('problems');
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('observation');
  const [done, setDone] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [kind, setKind] = useState<'note' | 'disease' | 'pest'>('note');
  const [problemCode, setProblemCode] = useState('');
  const [severity, setSeverity] = useState(2);
  const [qty, setQty] = useState(1);
  const [unit, setUnit] = useState<HarvestUnit>('kg');
  const [quality, setQuality] = useState<number>(4);
  const [files, setFiles] = useState<File[]>([]);
  const [uploadError, setUploadError] = useState<ActionError | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [xp, setXp] = useState(0);
  const finish = (msg: string) => { setDone(msg); setXp(0); setBody(''); setFiles([]); setProblemCode(''); };
  const journal = useAction(createJournalEntryAction, { onSuccess: () => finish(t('saved')) });
  const harvestAction = useAction(recordHarvestAction, { onSuccess: (d) => { finish(t('harvestSaved')); setXp(d.xp); } });
  const step = unit === 'kg' ? 0.1 : unit === 'g' ? 50 : 1;

  const submitJournal = async (extra: Record<string, unknown> = {}) => {
    setUploadError(null);
    let attachmentIds: string[] = [];
    if (files.length > 0) {
      setUploading(true);
      try {
        attachmentIds = (await Promise.all(files.map((f) => uploadPhoto(gardenId, f)))).map((r) => r.attachmentId);
      } catch {
        setUploadError({ code: 'VALIDATION', message: 'uploadFailed' });
        setUploading(false);
        return;
      }
      setUploading(false);
    }
    await journal.run({ gardenId, cultureId, kind, body, attachmentIds, ...(kind !== 'note' ? { problemCode, severity } : {}), ...extra });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setDone(null); }} title={title}
      trigger={<Button size="large" className={triggerClassName} aria-label={t('open')} data-testid="quick-open"><Plus aria-hidden /></Button>}>
      <Stack>
        <div className={styles.tiles} role="group" aria-label={t('modes')}>
          {([['observation', 'ui/action-observer'], ['photo', 'ui/action-photo'], ['watering', 'ui/action-arroser'], ['harvest', 'ui/action-recolter']] as const).map(([m, icon]) => (
            <button key={m} type="button" className={styles.tile} aria-pressed={mode === m} onClick={() => { setMode(m); setDone(null); if (m === 'photo') fileInput.current?.click(); }} data-testid={`quick-${m}`}>
              <span className={styles.tileIcon}><PixelIcon name={icon} size={32} /></span>
              {t(m)}
            </button>
          ))}
        </div>
        {done ? <Alert tone="success"><span data-testid="quick-done">{done}</span>{xp > 0 ? <> <strong data-testid="quick-xp">{t('xpGained', { xp })}</strong></> : null}</Alert> : null}
        <FormError error={uploadError ?? (journal.error && !Object.keys(journal.fieldErrors).length ? journal.error : null) ?? harvestAction.error} />

        <input ref={fileInput} type="file" accept="image/*" capture="environment" multiple hidden data-testid="quick-file"
          onChange={(e) => { setFiles([...(e.target.files ?? [])].slice(0, 6)); setMode((m) => (m === 'photo' ? 'photo' : m)); }} />

        {mode === 'observation' || mode === 'photo' ? (
          <form onSubmit={(e) => { e.preventDefault(); void submitJournal(); }}>
            <Stack gap="sm">
              {mode === 'observation' ? (
                <Field label={t('kind')}>{(p) => (
                  <NativeSelect {...p} value={kind} onChange={(e) => setKind(e.target.value === 'disease' ? 'disease' : e.target.value === 'pest' ? 'pest' : 'note')}>
                    <option value="note">{t('kindNote')}</option>
                    <option value="disease">{t('kindDisease')}</option>
                    <option value="pest">{t('kindPest')}</option>
                  </NativeSelect>
                )}</Field>
              ) : null}
              {kind !== 'note' && mode === 'observation' ? (
                <>
                  <Field label={t('problem')} errors={journal.fieldErrors.problemCode}>{(p) => (
                    <NativeSelect {...p} value={problemCode} onChange={(e) => setProblemCode(e.target.value)}>
                      <option value="">{t('choose')}</option>
                      {problems.filter((pr) => pr.category === (kind === 'pest' ? 'pest' : 'disease') || pr.code === 'other').map((pr) => <option key={pr.code} value={pr.code}>{tDynamic(tp, pr.code, pr.code)}</option>)}
                    </NativeSelect>
                  )}</Field>
                  <Field label={t('severity')}>{(p) => (
                    <NativeSelect {...p} value={severity} onChange={(e) => setSeverity(Number(e.target.value))}>
                      <option value={1}>{t('severity1')}</option>
                      <option value={2}>{t('severity2')}</option>
                      <option value={3}>{t('severity3')}</option>
                    </NativeSelect>
                  )}</Field>
                </>
              ) : null}
              <Field label={t('note')} errors={journal.fieldErrors.body}>{(p) => <TextArea {...p} value={body} onChange={(e) => setBody(e.target.value)} data-testid="quick-note" />}</Field>
              <Button variant="secondary" onClick={() => fileInput.current?.click()}>{files.length > 0 ? t('photosSelected', { count: files.length }) : t('addPhotos')}</Button>
              <Button type="submit" size="large" block disabled={journal.pending || uploading || (!body && files.length === 0 && kind === 'note')} data-testid="quick-save">{uploading ? t('uploading') : t('save')}</Button>
            </Stack>
          </form>
        ) : null}

        {mode === 'watering' ? (
          <Button size="large" block disabled={journal.pending} onClick={() => void journal.run({ gardenId, cultureId, kind: 'intervention', intervention: 'watering', attachmentIds: [] })} data-testid="quick-water">{t('waterNow')}</Button>
        ) : null}

        {mode === 'harvest' ? (
          <form onSubmit={(e) => { e.preventDefault(); void harvestAction.run({ gardenId, cultureId, quantity: qty, unit, quality, seedSaving: false, note: body }); }}>
            <Stack gap="sm">
              <div className={styles.stepper}>
                <button type="button" className={styles.stepButton} aria-label={t('less')} onClick={() => setQty((q) => Math.max(step, Math.round((q - step) * 1000) / 1000))}>−</button>
                <output aria-live="polite" data-testid="quick-qty">{qty} {t(`unit_${unit}`)}</output>
                <button type="button" className={styles.stepButton} aria-label={t('more')} onClick={() => setQty((q) => Math.round((q + step) * 1000) / 1000)}>+</button>
              </div>
              <Field label={t('quantity')}>{(p) => <TextInput {...p} inputMode="decimal" value={qty} onChange={(e) => setQty(Number(e.target.value.replace(',', '.')) || 0)} data-testid="quick-qty-input" />}</Field>
              <Field label={t('unit')}>{(p) => (
                <NativeSelect {...p} value={unit} onChange={(e) => setUnit(HARVEST_UNITS.find((u) => u === e.target.value) ?? unit)}>
                  {HARVEST_UNITS.map((u) => <option key={u} value={u}>{t(`unit_${u}`)}</option>)}
                </NativeSelect>
              )}</Field>
              <div className={styles.quality} role="group" aria-label={t('quality')}>
                {QUALITY.map((q) => <button key={q.v} type="button" className={styles.qualityOption} aria-pressed={quality === q.v} onClick={() => setQuality(q.v)}>{t(q.key)}</button>)}
              </div>
              <Field label={t('noteOptional')}>{(p) => <TextInput {...p} value={body} onChange={(e) => setBody(e.target.value)} />}</Field>
              <Button type="submit" size="large" block disabled={harvestAction.pending || qty <= 0} data-testid="quick-harvest-save">{t('save')}</Button>
            </Stack>
          </form>
        ) : null}
      </Stack>
    </Dialog>
  );
}
