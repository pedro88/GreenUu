'use client';

import { Star } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Checkbox, Field, TextArea, TextInput } from '@/components/ui/Field';
import { FormError } from '@/components/ui/FormError';
import { Muted, Row, Stack } from '@/components/ui/Layout';
import { useAction } from '@/components/ui/useAction';
import { submitResultAction } from '../actions';

type Initial = {
  totalKg: number | null; noHarvest: boolean; quality: number | null; successPct: number | null; rating: number | null; wouldGrowAgain: boolean | null;
  problems: { problemId: string; severity: number }[]; noProblem: boolean; notes: string;
};

/** Choix de 1 à 5, au clavier comme au doigt (boutons radio natifs). */
function Scale({ name, label, value, onChange, unit }: { name: string; label: string; value: number | null; onChange: (v: number) => void; unit: (n: number) => string }) {
  return (
    <fieldset>
      <legend>{label}</legend>
      <Row role="radiogroup">
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} style={{ minWidth: 48, minHeight: 48, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <input type="radio" name={name} value={n} checked={value === n} onChange={() => onChange(n)} data-testid={`${name}-${n}`} />
            <span aria-hidden>{Array.from({ length: n }, (_, i) => <Star key={i} size={14} fill="currentColor" />)}</span><span className="visually-hidden">{unit(n)}</span>
          </label>
        ))}
      </Row>
    </fieldset>
  );
}

/** RG-RES-02 : bilan en un écran ; la complétude affichée après enregistrement dit ce qui manque (RG-RES-03). */
export function ResultForm({ gardenId, cultureId, initial, problems, areaKnown, shared }: {
  gardenId: string; cultureId: string; initial: Initial; problems: { id: string; label: string }[]; areaKnown: boolean; shared: boolean;
}) {
  const t = useTranslations('results');
  const f = useFormatter();
  const [totalKg, setTotalKg] = useState(initial.totalKg === null ? '' : String(initial.totalKg));
  const [noHarvest, setNoHarvest] = useState(initial.noHarvest);
  const [quality, setQuality] = useState(initial.quality);
  const [successPct, setSuccessPct] = useState(initial.successPct ?? 50);
  const [successTouched, setSuccessTouched] = useState(initial.successPct !== null);
  const [rating, setRating] = useState(initial.rating);
  const [again, setAgain] = useState(initial.wouldGrowAgain);
  const [chosen, setChosen] = useState(new Map(initial.problems.map((p) => [p.problemId, p.severity])));
  const [noProblem, setNoProblem] = useState(initial.noProblem);
  const [notes, setNotes] = useState(initial.notes);
  const [saved, setSaved] = useState<{ completeness: number; yieldKgM2: number | null } | null>(null);
  const action = useAction(submitResultAction, { onSuccess: (d) => setSaved({ completeness: d.completeness, yieldKgM2: d.yieldKgM2 }) });
  const toggle = (id: string) => {
    const next = new Map(chosen);
    if (next.has(id)) next.delete(id);
    else next.set(id, 2);
    setChosen(next);
    if (next.size > 0) setNoProblem(false);
  };
  const submit = () => void action.run({
    gardenId, cultureId, totalKg: noHarvest || totalKg === '' ? null : Number(totalKg), noHarvest, quality, successPct: successTouched ? successPct : null, rating,
    wouldGrowAgain: again, problems: [...chosen.entries()].map(([problemId, severity]) => ({ problemId, severity })), noProblem, notes,
  });
  return (
    <form method="post" onSubmit={(e) => { e.preventDefault(); submit(); }} data-testid="result-form">
      <Stack>
        <Muted>{t('intro')}</Muted>
        <FormError error={action.error} />
        <Row>
          <Field label={t('totalKg')} hint={t('totalKgHint')}>{(p) => (
            <TextInput {...p} type="number" min={0} step={0.1} inputMode="decimal" disabled={noHarvest} value={totalKg} onChange={(e) => setTotalKg(e.target.value)} data-testid="result-total" />
          )}</Field>
          <Checkbox label={t('noHarvest')} checked={noHarvest} onChange={(e) => setNoHarvest(e.target.checked)} />
        </Row>
        <Scale name="quality" label={t('quality')} value={quality} onChange={setQuality} unit={(n) => t('stars', { count: n })} />
        <Field label={t('successPct')}>{(p) => (
          <Row>
            <input {...p} type="range" min={0} max={100} step={5} value={successPct} onChange={(e) => { setSuccessPct(Number(e.target.value)); setSuccessTouched(true); }} data-testid="result-success" style={{ flex: 1, minHeight: 48 }} />
            <output>{successTouched ? t('successValue', { value: successPct }) : null}</output>
          </Row>
        )}</Field>
        <fieldset>
          <legend>{t('problems')}</legend>
          <Row>
            {problems.map((p) => (
              <Checkbox key={p.id} label={p.label} checked={chosen.has(p.id)} onChange={() => toggle(p.id)} data-testid={`result-problem-${p.id}`} />
            ))}
            <Checkbox label={t('noProblem')} checked={noProblem} onChange={(e) => { setNoProblem(e.target.checked); if (e.target.checked) setChosen(new Map()); }} data-testid="result-no-problem" />
          </Row>
        </fieldset>
        <Scale name="rating" label={t('rating')} value={rating} onChange={setRating} unit={(n) => t('stars', { count: n })} />
        <fieldset>
          <legend>{t('wouldGrowAgain')}</legend>
          <Row role="radiogroup">
            <label style={{ minHeight: 48, display: 'inline-flex', alignItems: 'center', gap: 4 }}><input type="radio" name="again" checked={again === true} onChange={() => setAgain(true)} data-testid="result-again-yes" />{t('yes')}</label>
            <label style={{ minHeight: 48, display: 'inline-flex', alignItems: 'center', gap: 4 }}><input type="radio" name="again" checked={again === false} onChange={() => setAgain(false)} data-testid="result-again-no" />{t('no')}</label>
          </Row>
        </fieldset>
        <Field label={t('notes')}>{(p) => <TextArea {...p} maxLength={4000} value={notes} onChange={(e) => setNotes(e.target.value)} />}</Field>
        <Muted>{shared ? t('shared') : t('notShared')}</Muted>
        <Button type="submit" size="large" block disabled={action.pending} data-testid="result-save">{t('save')}</Button>
        {saved ? (
          <Alert tone="success" role="status">
            <span data-testid="result-saved">{t('saved', { completeness: saved.completeness })}</span>{' '}
            {saved.yieldKgM2 !== null ? <span data-testid="result-yield">{t('yield', { value: f.number(saved.yieldKgM2, { maximumFractionDigits: 2 }) })}</span> : null}
            {saved.yieldKgM2 === null && !areaKnown && !noHarvest ? <span data-testid="result-no-area">{t('noArea')}</span> : null}
          </Alert>
        ) : null}
      </Stack>
    </form>
  );
}
