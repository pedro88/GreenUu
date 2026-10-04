'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogActions } from '@/components/ui/Dialog';
import { Field, NativeSelect, TextArea, TextInput } from '@/components/ui/Field';
import { FormError } from '@/components/ui/FormError';
import { Row, Stack } from '@/components/ui/Layout';
import { useAction } from '@/components/ui/useAction';
import styles from '../../guide/ui/Content.module.scss';
import { createTipAction, suggestTagsAction } from '../actions';

/** RG-TIP-01 : tip court, 1 à 5 tags avec 3 suggestions, contexte du jardin courant (retirable). */
export function TipComposer({ gardens, species, defaultGardenId }: { gardens: { id: string; name: string }[]; species: { id: string; name: string }[]; defaultGardenId: string | null }) {
  const t = useTranslations('tips');
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState('');
  const [tags, setTags] = useState('');
  const [speciesId, setSpeciesId] = useState('');
  const [contextGardenId, setContextGardenId] = useState(defaultGardenId ?? '');
  const [done, setDone] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const create = useAction(createTipAction, { onSuccess: () => { setDone(true); setBody(''); setTags(''); } });
  const suggest = useAction(suggestTagsAction, { refresh: false, onSuccess: setSuggestions });
  const parts = tags.split(',').map((x) => x.trim());
  const prefix = parts[parts.length - 1] ?? '';
  const chosen = parts.slice(0, -1).filter(Boolean);
  const { run: runSuggest } = suggest;
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => void runSuggest({ prefix: prefix.toLowerCase(), exclude: chosen.slice(0, 5) }), 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- suggestions recalculées sur le texte des tags seulement
  }, [open, tags]);
  const addTag = (slug: string) => setTags([...chosen, slug, ''].join(', '));
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setDone(false); create.reset(); } }} title={t('share')}
      trigger={<Button size="large" className={styles.fab} data-testid="tip-share">{t('share')}</Button>}>
      {done ? <Alert tone="success" role="status"><span data-testid="tip-published">{t('published')}</span></Alert> : (
        <form method="post" onSubmit={(e) => { e.preventDefault(); void create.run({ body, tags: tags.split(','), speciesId, contextGardenId }); }}>
          <Stack>
            <FormError error={create.error && !Object.keys(create.fieldErrors).length ? create.error : null} />
            <Field label={t('body')} hint={t('bodyHint')} errors={create.fieldErrors.body}>{(p) => <TextArea {...p} required minLength={10} maxLength={500} rows={4} value={body} onChange={(e) => setBody(e.target.value)} data-testid="tip-body" />}</Field>
            <Field label={t('tags')} hint={t('tagsHint')} errors={create.fieldErrors.tags}>{(p) => <TextInput {...p} value={tags} onChange={(e) => setTags(e.target.value)} data-testid="tip-tags" />}</Field>
            {suggestions.length > 0 ? (
              <Row role="group" aria-label={t('suggestions')}>
                {suggestions.map((s) => <Button key={s} variant="secondary" onClick={() => addTag(s)} data-testid={`tip-suggestion-${s}`}>{s}</Button>)}
              </Row>
            ) : null}
            <Field label={t('species')}>{(p) => (
              <NativeSelect {...p} value={speciesId} onChange={(e) => setSpeciesId(e.target.value)}>
                <option value="">{t('anySpecies')}</option>
                {species.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </NativeSelect>
            )}</Field>
            <Field label={t('context')}>{(p) => (
              <NativeSelect {...p} value={contextGardenId} onChange={(e) => setContextGardenId(e.target.value)} data-testid="tip-context">
                <option value="">{t('noContext')}</option>
                {gardens.map((g) => <option key={g.id} value={g.id}>{t('contextFrom')} — {g.name}</option>)}
              </NativeSelect>
            )}</Field>
            <DialogActions><Button type="submit" disabled={create.pending || body.trim().length < 10} data-testid="tip-submit">{t('publish')}</Button></DialogActions>
          </Stack>
        </form>
      )}
    </Dialog>
  );
}
