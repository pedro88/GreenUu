'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import { Button } from '@/components/ui/Button';
import { Checkbox, ChipGroup, Field, NativeSelect, TextArea, TextInput } from '@/components/ui/Field';
import { FormError } from '@/components/ui/FormError';
import { Card, Muted, Row, Stack } from '@/components/ui/Layout';
import mdStyles from '@/components/ui/Markdown.module.scss';
import { useAction } from '@/components/ui/useAction';
import { ENVIRONMENTS, GUIDE_VISIBILITIES, STAGES, type Environment, type GuideVisibility, type Stage } from '@/lib/enums';
import type { GuideCalendarV1, GuideDraft } from '@/lib/content-types';
import { createGuideAction, publishGuideAction, updateGuideAction } from '../actions';

const OFFSET_STAGES: Stage[] = ['emergence', 'transplanting', 'planting', 'flowering', 'fruiting', 'harvest_start', 'harvest_end'];
type TaskRow = { title: string; relativeTo: Stage; offsetDays: string };

export type GuideEditorProps = {
  guideId: string | null;
  species: { id: string; name: string }[];
  varieties: { id: string; speciesId: string; name: string }[];
  gardens: { id: string; name: string }[];
  initial: { speciesId: string; varietyId: string | null; visibility: GuideVisibility; gardenId: string | null; draft: GuideDraft };
  /** Fork d'un guide privé : visibilité et jardin verrouillés (RG-GUI-04). */
  lockedPrivateGardenId: string | null;
};

export function GuideEditor({ guideId, species, varieties, gardens, initial, lockedPrivateGardenId }: GuideEditorProps) {
  const t = useTranslations('guides');
  const tv = useTranslations('guideVisibility');
  const ts = useTranslations('stages');
  const te = useTranslations('environments');
  const router = useRouter();
  const [speciesId, setSpeciesId] = useState(initial.speciesId);
  const [varietyId, setVarietyId] = useState(initial.varietyId ?? '');
  const [visibility, setVisibility] = useState<GuideVisibility>(lockedPrivateGardenId ? 'private' : initial.visibility);
  const [gardenId, setGardenId] = useState(lockedPrivateGardenId ?? initial.gardenId ?? '');
  const [title, setTitle] = useState(initial.draft.title);
  const [bodyMd, setBodyMd] = useState(initial.draft.bodyMd);
  const [preview, setPreview] = useState(false);
  const [koppen, setKoppen] = useState((initial.draft.context.koppen ?? []).join(', '));
  const [environments, setEnvironments] = useState<Environment[]>(initial.draft.context.environments ?? []);
  const cal = initial.draft.calendarTemplate;
  const [calendarOn, setCalendarOn] = useState(cal !== null);
  const [anchor, setAnchor] = useState<'sowing' | 'planting'>(cal?.anchor ?? 'sowing');
  const [offsets, setOffsets] = useState<Partial<Record<Stage, string>>>(Object.fromEntries((cal?.stages ?? []).map((s) => [s.stage, String(s.offsetDays)])));
  const [tasks, setTasks] = useState<TaskRow[]>((cal?.tasks ?? []).map((x) => ({ title: x.title, relativeTo: x.relativeTo, offsetDays: String(x.offsetDays) })));
  const [changeNote, setChangeNote] = useState('');
  // Ref et non état : le rappel de succès doit voir le choix fait au clic, pas celui du rendu précédent.
  const then = useRef<'stay' | 'publish'>('stay');
  const publish = useAction(publishGuideAction, { refresh: false, onSuccess: (d) => router.push(`/app/guides/${d.guideId}`) });
  const onSaved = (id: string) => (then.current === 'publish' ? void publish.run({ guideId: id }) : router.push(`/app/guides/${id}`));
  const create = useAction(createGuideAction, { refresh: false, onSuccess: (d) => onSaved(d.guideId) });
  const update = useAction(updateGuideAction, { refresh: false, onSuccess: (d) => onSaved(d.guideId) });
  const error = create.error ?? update.error ?? publish.error;
  const fe = { ...create.fieldErrors, ...update.fieldErrors, ...publish.fieldErrors };

  const calendarTemplate = (): GuideCalendarV1 | null => (calendarOn ? {
    v: 1, anchor,
    stages: OFFSET_STAGES.flatMap((s) => (offsets[s] !== undefined && offsets[s] !== '' && s !== anchor ? [{ stage: s, offsetDays: Number(offsets[s]) }] : [])),
    tasks: tasks.filter((x) => x.title.trim().length > 0).map((x) => ({ title: x.title.trim(), type: 'task', relativeTo: x.relativeTo, offsetDays: Number(x.offsetDays) || 0 })),
  } : null);

  const submit = (mode: 'stay' | 'publish') => {
    then.current = mode;
    const draft = {
      title, bodyMd, changeNote,
      context: { v: 1 as const, ...(koppen.trim() ? { koppen: koppen.split(',').map((k) => k.trim()).filter(Boolean) } : {}), ...(environments.length ? { environments } : {}) },
      calendarTemplate: calendarTemplate(),
    };
    const common = { visibility, gardenId: visibility === 'private' ? gardenId : '', varietyId, draft };
    if (guideId) void update.run({ guideId, ...common });
    else void create.run({ speciesId, ...common });
  };
  const pending = create.pending || update.pending || publish.pending;

  return (
    <form onSubmit={(e) => { e.preventDefault(); submit('stay'); }} data-testid="guide-editor">
      <Stack>
        <FormError error={error && !Object.keys(fe).length ? error : null} />
        <Field label={t('titleLabel')} errors={fe['draft.title']}>{(p) => <TextInput {...p} required minLength={3} maxLength={140} value={title} onChange={(e) => setTitle(e.target.value)} />}</Field>
        <Row>
          <Field label={t('species')}>{(p) => (
            <NativeSelect {...p} value={speciesId} disabled={guideId !== null} onChange={(e) => { setSpeciesId(e.target.value); setVarietyId(''); }}>
              {species.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </NativeSelect>
          )}</Field>
          <Field label={t('variety')}>{(p) => (
            <NativeSelect {...p} value={varietyId} onChange={(e) => setVarietyId(e.target.value)}>
              <option value="">{t('anyVariety')}</option>
              {varieties.filter((v) => v.speciesId === speciesId).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </NativeSelect>
          )}</Field>
        </Row>
        {lockedPrivateGardenId ? <Muted>{t('forkPrivate')}</Muted> : (
          <Row>
            <Field label={t('visibility')} errors={fe.visibility}>{(p) => (
              <NativeSelect {...p} value={visibility} onChange={(e) => setVisibility(GUIDE_VISIBILITIES.find((v) => v === e.target.value) ?? visibility)} data-testid="guide-visibility">
                {GUIDE_VISIBILITIES.map((v) => <option key={v} value={v}>{tv(v)}</option>)}
              </NativeSelect>
            )}</Field>
            {visibility === 'private' ? (
              <Field label={t('garden')} errors={fe.gardenId}>{(p) => (
                <NativeSelect {...p} value={gardenId} onChange={(e) => setGardenId(e.target.value)}>
                  <option value="">{t('chooseGarden')}</option>
                  {gardens.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </NativeSelect>
              )}</Field>
            ) : null}
          </Row>
        )}
        <Row>
          <Button variant={preview ? 'secondary' : undefined} onClick={() => setPreview(false)} aria-pressed={!preview}>{t('write')}</Button>
          <Button variant={preview ? undefined : 'secondary'} onClick={() => setPreview(true)} aria-pressed={preview} data-testid="guide-preview">{t('preview')}</Button>
        </Row>
        {preview ? (
          <Card className={mdStyles.md}><ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]} skipHtml>{bodyMd}</ReactMarkdown></Card>
        ) : (
          <Field label={t('body')} hint={t('bodyHint')} errors={fe['draft.bodyMd'] ?? fe.bodyMd}>{(p) => <TextArea {...p} rows={14} value={bodyMd} onChange={(e) => setBodyMd(e.target.value)} data-testid="guide-body" />}</Field>
        )}
        <fieldset>
          <legend>{t('context')}</legend>
          <Stack gap="sm">
            <Field label={t('contextKoppen')} errors={fe['draft.context.koppen.0']}>{(p) => <TextInput {...p} value={koppen} onChange={(e) => setKoppen(e.target.value)} />}</Field>
            <ChipGroup legend={t('contextEnvironments')} name="environments" value={environments} onChange={setEnvironments} options={ENVIRONMENTS.map((e) => ({ value: e, label: te(e) }))} />
          </Stack>
        </fieldset>
        <fieldset>
          <legend>{t('calendar')}</legend>
          <Stack gap="sm">
            <Checkbox label={t('calendarEnabled')} checked={calendarOn} onChange={(e) => setCalendarOn(e.target.checked)} data-testid="guide-calendar-on" />
            {calendarOn ? (
              <>
                <Field label={t('anchor')}>{(p) => (
                  <NativeSelect {...p} value={anchor} onChange={(e) => setAnchor(e.target.value === 'planting' ? 'planting' : 'sowing')} data-testid="guide-anchor">
                    <option value="sowing">{ts('sowing')}</option>
                    <option value="planting">{ts('planting')}</option>
                  </NativeSelect>
                )}</Field>
                <Row>
                  {OFFSET_STAGES.filter((s) => s !== anchor).map((s) => (
                    <Field key={s} label={`${ts(s)} — ${t('stageOffset')}`}>{(p) => (
                      <TextInput {...p} type="number" min={-366} max={366} inputMode="numeric" value={offsets[s] ?? ''} onChange={(e) => setOffsets({ ...offsets, [s]: e.target.value })} data-testid={`guide-offset-${s}`} />
                    )}</Field>
                  ))}
                </Row>
                <h3>{t('tasks')}</h3>
                {tasks.map((task, i) => (
                  <Row key={i} data-testid={`guide-task-${i}`}>
                    <Field label={t('taskTitle')}>{(p) => <TextInput {...p} value={task.title} onChange={(e) => setTasks(tasks.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />}</Field>
                    <Field label={t('taskRelativeTo')}>{(p) => (
                      <NativeSelect {...p} value={task.relativeTo} onChange={(e) => setTasks(tasks.map((x, j) => (j === i ? { ...x, relativeTo: STAGES.find((s) => s === e.target.value) ?? x.relativeTo } : x)))}>
                        {STAGES.map((s) => <option key={s} value={s}>{ts(s)}</option>)}
                      </NativeSelect>
                    )}</Field>
                    <Field label={t('taskOffset')}>{(p) => <TextInput {...p} type="number" min={-366} max={366} value={task.offsetDays} onChange={(e) => setTasks(tasks.map((x, j) => (j === i ? { ...x, offsetDays: e.target.value } : x)))} />}</Field>
                    <Button variant="secondary" onClick={() => setTasks(tasks.filter((_, j) => j !== i))}>{t('removeTask')}</Button>
                  </Row>
                ))}
                <Button variant="secondary" onClick={() => setTasks([...tasks, { title: '', relativeTo: anchor, offsetDays: '0' }])} data-testid="guide-add-task">{t('addTask')}</Button>
              </>
            ) : null}
          </Stack>
        </fieldset>
        <Field label={t('changeNote')}>{(p) => <TextInput {...p} maxLength={300} value={changeNote} onChange={(e) => setChangeNote(e.target.value)} />}</Field>
        {visibility !== 'private' ? <Muted>{t('license')}</Muted> : null}
        <Row>
          <Button type="submit" variant="secondary" disabled={pending || title.trim().length < 3} data-testid="guide-save">{t('save')}</Button>
          <Button size="large" disabled={pending || title.trim().length < 3 || bodyMd.trim().length === 0} onClick={() => submit('publish')} data-testid="guide-save-publish">{t('saveAndPublish')}</Button>
        </Row>
      </Stack>
    </form>
  );
}
