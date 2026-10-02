'use client';

import { Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useStore } from 'zustand';
import { Button } from '@/components/ui/Button';
import { FormError } from '@/components/ui/FormError';
import { useAction } from '@/components/ui/useAction';
import { tDynamic } from '@/i18n/dynamic';
import type { AvatarLayer } from '@/lib/enums';
import { useUnlockLabel } from '../../progression/ui/unlockLabel';
import { saveAvatarAction } from '../actions';
import { AVATAR_TABS } from '../catalog';
import { drawAvatar, SPRITE, WALK, type Pose } from '../compose';
import type { AvatarConfigV1 } from '../config.pure';
import type { AvatarCatalog, AvatarView } from '../service';
import { createAvatarEditorStore, type AvatarEditorStore } from './editorStore';
import styles from './AvatarEditor.module.scss';

type Item = AvatarCatalog['items'][number];

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return reduced;
}

/** Éditeur d'avatar (SPEC §10.4, PAGES.md §6 `/app/profil/avatar`, étape 1 de `/bienvenue`). */
export function AvatarEditor({ catalog, avatar, footer }: { catalog: AvatarCatalog; avatar: AvatarView; footer?: ReactNode }) {
  const t = useTranslations('avatar');
  const unlockLabel = useUnlockLabel();
  const store = useMemo(() => createAvatarEditorStore(avatar.config, avatar.configHash), []); // eslint-disable-line react-hooks/exhaustive-deps
  const draft = useStore(store, (s) => s.draft);
  const savedHash = useStore(store, (s) => s.savedHash);
  const dirty = useStore(store, (s) => s.dirty());
  const [tab, setTab] = useState<(typeof AVATAR_TABS)[number]['key']>('hair');
  const [hint, setHint] = useState<string | null>(null);
  const [walking, setWalking] = useState(true);
  const reduced = usePrefersReducedMotion();
  const save = useAction(saveAvatarAction, { onSuccess: (v) => { store.getState().commit(v.config, v.configHash); setHint(t('saved')); } });

  // Nouvelle version enregistrée venue du serveur (autre onglet, revalidation) : elle devient la base.
  useEffect(() => { if (avatar.configHash !== store.getState().savedHash) store.getState().commit(avatar.config, avatar.configHash); }, [avatar, store]);

  const unlocked = useMemo(() => new Set(catalog.items.filter((i) => i.unlocked).map((i) => i.code)), [catalog]);
  const ramps = useMemo(() => new Map(catalog.palettes.map((p) => [p.code, p.ramp])), [catalog]);
  const current = AVATAR_TABS.find((x) => x.key === tab) ?? AVATAR_TABS[0];
  const layer: AvatarLayer = current.layer;
  const items = catalog.items.filter((i) => i.layer === layer);
  const selected = draft.layers[layer];
  const selectedItem = items.find((i) => i.code === selected?.item);
  const optional = layer !== 'body' && layer !== 'face_eyes';

  const choose = (i: Item) => {
    if (!i.unlocked) { setHint(t('lockedHint', { condition: unlockLabel(i.condition) })); return; }
    setHint(null);
    // On garde les couleurs choisies si elles restent autorisées pour le nouvel élément.
    const prev = selected?.palettes ?? [];
    store.getState().setItem(layer, i.code, i.allowed.map((a, k) => (prev[k] && a.includes(prev[k]) ? prev[k] : a[0] ?? '')));
  };

  return (
    <div className={styles.root} data-testid="avatar-editor" data-config-hash={savedHash} data-dirty={dirty ? 'true' : 'false'}>
      <Preview store={store} walking={walking && !reduced} />
      <div className={styles.turn} role="group" aria-label={t('turnLabel')}>
        <Button variant="secondary" onClick={() => store.getState().turn(-1)} aria-label={t('turnLeft')} data-testid="avatar-turn-left">◀</Button>
        <Button variant="secondary" aria-pressed={walking && !reduced} disabled={reduced} onClick={() => setWalking((w) => !w)}>{t('walk')}</Button>
        <Button variant="secondary" onClick={() => store.getState().turn(1)} aria-label={t('turnRight')} data-testid="avatar-turn-right">▶</Button>
      </div>

      <div className={styles.tabs} role="tablist" aria-label={t('categories')}>
        {AVATAR_TABS.map((x) => (
          <button key={x.key} type="button" role="tab" aria-selected={tab === x.key} className={styles.tab} onClick={() => { setTab(x.key); setHint(null); }} data-testid={`avatar-tab-${x.key}`}>{t(`tab_${x.key}`)}</button>
        ))}
      </div>

      <div role="tabpanel" aria-label={t(`tab_${current.key}`)} className={styles.panel}>
        <ul className={styles.grid} data-testid="avatar-items">
          {optional ? (
            <li><button type="button" className={styles.item} aria-pressed={!selected?.item} onClick={() => { setHint(null); store.getState().setItem(layer, null, []); }} data-testid="avatar-item-none">
              <span className={styles.none} aria-hidden>∅</span><span className={styles.itemLabel}>{t('none')}</span>
            </button></li>
          ) : null}
          {items.map((i) => (
            <li key={i.code}>
              <button type="button" className={styles.item} aria-pressed={selected?.item === i.code} aria-disabled={!i.unlocked} data-locked={i.unlocked ? 'false' : 'true'}
                onClick={() => choose(i)} data-testid={`avatar-item-${i.code}`}>
                <ItemPreview draft={draft} layer={layer} item={i} />
                <span className={styles.itemLabel}>{tDynamic(t, `item_${i.code}`, i.code)}</span>
                {i.unlocked ? null : <span className={styles.lock} data-testid={`avatar-lock-${i.code}`}><Lock aria-hidden size={14} />{unlockLabel(i.condition)}</span>}
              </button>
            </li>
          ))}
        </ul>
        {selectedItem?.slots.map((slot, k) => (
          <fieldset key={`${slot}-${k}`} className={styles.swatches} data-testid={`avatar-swatches-${k}`}>
            <legend>{t(`slot_${slot}`)}</legend>
            {selectedItem.allowed[k]?.map((code) => (
              <button key={code} type="button" className={styles.swatch} aria-pressed={selected?.palettes[k] === code} aria-label={tDynamic(t, `palette_${code}`, code)}
                style={{ background: ramps.get(code)?.[1] }} onClick={() => store.getState().setPalette(layer, k, code)} data-testid={`avatar-palette-${code}`} />
            ))}
          </fieldset>
        ))}
      </div>

      <p role="status" className={styles.hint} data-testid="avatar-hint">{hint}</p>
      <FormError error={save.error} />
      <div className={styles.actions}>
        <Button variant="secondary" onClick={() => { setHint(null); store.getState().randomize((c) => unlocked.has(c)); }} data-testid="avatar-random">{t('random')}</Button>
        <Button variant="secondary" disabled={!dirty} onClick={() => { setHint(null); save.reset(); store.getState().revert(); }} data-testid="avatar-cancel">{t('cancel')}</Button>
        <Button disabled={save.pending || !dirty} onClick={() => { setHint(null); void save.run({ config: store.getState().draft }); }} data-testid="avatar-save">{t('save')}</Button>
        {footer}
      </div>
    </div>
  );
}

/** Aperçu animé (§10.4) : 4 directions, à l'arrêt ou en marche ; glisser horizontalement fait tourner. */
function Preview({ store, walking }: { store: AvatarEditorStore; walking: boolean }) {
  const t = useTranslations('avatar');
  const ref = useRef<HTMLCanvasElement>(null);
  const drag = useRef<number | null>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return undefined;
    let raf = 0;
    let frame = 0;
    let last = 0;
    let drawn = '';
    const tick = (now: number) => {
      const s = store.getState();
      if (walking && now - last > 160) { frame = (frame + 1) % WALK.length; last = now; }
      const pose: Pose = walking ? WALK[frame] ?? 'arret' : 'arret';
      const key = `${JSON.stringify(s.draft)}|${s.dir}|${pose}`;
      if (key !== drawn) { drawn = key; void drawAvatar(ctx, s.draft, s.dir, pose); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [store, walking]);
  const dir = useStore(store, (s) => s.dir);
  return (
    <div className={styles.preview}>
      <canvas ref={ref} width={SPRITE.w} height={SPRITE.h} className={styles.canvas} role="img" aria-label={t('previewLabel', { direction: t(`dir_${dir}`) })} data-testid="avatar-preview"
        onPointerDown={(e) => { drag.current = e.clientX; }}
        onPointerMove={(e) => {
          if (drag.current === null || Math.abs(e.clientX - drag.current) < 40) return;
          store.getState().turn(e.clientX > drag.current ? 1 : -1);
          drag.current = e.clientX;
        }}
        onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} />
    </div>
  );
}

/** Vignette d'un élément : l'avatar en cours, avec cet élément à la place de celui du calque. */
function ItemPreview({ draft, layer, item }: { draft: AvatarConfigV1; layer: AvatarLayer; item: Item }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const key = JSON.stringify(draft.layers) + item.code;
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    const palettes = item.allowed.map((a, k) => { const p = draft.layers[layer]?.palettes[k]; return p && a.includes(p) ? p : a[0] ?? ''; });
    void drawAvatar(ctx, { v: 1, layers: { ...draft.layers, [layer]: { item: item.code, palettes } } });
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return <canvas ref={ref} width={SPRITE.w} height={SPRITE.h} className={styles.itemCanvas} aria-hidden />;
}
