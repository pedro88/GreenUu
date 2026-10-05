'use client';

import dynamic from 'next/dynamic';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Field, NativeSelect } from '@/components/ui/Field';
import { frameDates, historyBounds, sceneAt, type HistoryData, type HistoryStep } from '@/features/scene/timelapse.pure';
import type { CanvasStatus } from './GardenCanvas';
import { usePrefersReducedMotion } from './GardenView';
import { createCameraStore, createDraftStore, createSceneStore, createSelectionStore, type GameStores } from './stores';
import { fitCamera, useViewportGestures } from './viewport';
import styles from './GardenView.module.scss';

const GardenCanvas = dynamic(() => import('./GardenCanvas'), { ssr: false });

/** Environ 4 images par seconde (TLP-07). */
const FRAME_MS = 250;

/** Première date utile : le premier instantané ou la première étape d'une culture (bornée à 3 ans par `frameDates`). */
function firstDate(data: HistoryData): string {
  const dates = [...data.snapshots.map((s) => s.takenOn), ...data.cultures.flatMap((c) => c.stages.flatMap((s) => [s.actualOn ?? s.plannedOn ?? data.today]))];
  return dates.reduce((m, d) => (d < m ? d : m), data.today);
}

/** Histoire du jardin (SPEC §12.11, PAGES.md §4 `/histoire`) : le timelapse du plan et des cultures, lu sur la vue jardin. */
export function HistoryPlayer({ data }: { data: HistoryData }) {
  const t = useTranslations('history');
  const tSeason = useTranslations('reco');
  const f = useFormatter();
  const reducedMotion = usePrefersReducedMotion() || data.reducedMotion;
  const [step, setStep] = useState<HistoryStep>('week');
  const dates = useMemo(() => frameDates(firstDate(data), data.today, step), [data, step]);
  const [index, setIndex] = useState(0);
  // Lecture automatique, sauf en animations réduites (TLP-06) ; ensuite, c'est l'utilisateur qui décide.
  const [chosen, setPlaying] = useState<boolean | null>(null);
  const playing = chosen ?? !reducedMotion;
  const bounds = useMemo(() => historyBounds(data), [data]);
  const date = dates[Math.min(index, dates.length - 1)] ?? data.today;
  const frame = useMemo(() => sceneAt(data, date, { bounds, reducedMotion: true }), [data, date, bounds]);
  const stores = useMemo<GameStores>(() => ({ scene: createSceneStore(frame.scene), camera: createCameraStore(), selection: createSelectionStore(), draft: createDraftStore() }), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [canvas, setCanvas] = useState<CanvasStatus>({ canvas: 'loading', ticker: false });
  const viewport = useRef<HTMLDivElement>(null);
  useViewportGestures(viewport, stores, { enabled: () => true });

  useEffect(() => { stores.scene.getState().setSnapshot(frame.scene); }, [frame, stores]);
  useEffect(() => {
    stores.camera.setState(fitCamera(stores.scene.getState().snapshot, viewport.current?.clientWidth ?? 360, viewport.current?.clientHeight ?? 480));
  }, [stores]);
  useEffect(() => {
    if (!playing) return undefined;
    const id = window.setInterval(() => setIndex((i) => {
      if (i >= dates.length - 1) { setPlaying(false); return i; }
      return i + 1;
    }), FRAME_MS);
    return () => window.clearInterval(id);
  }, [playing, dates.length]);

  const label = f.dateTime(new Date(`${date}T12:00:00Z`), { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const season = frame.scene.ambient.season;
  const firstPlan = data.snapshots[0]?.takenOn ?? null;
  const go = (i: number) => { setPlaying(false); setIndex(Math.max(0, Math.min(dates.length - 1, i))); };

  return (
    <div className={styles.root} data-testid="history" data-frames={dates.length} data-index={index} data-date={date} data-reconstructed={frame.reconstructed ? 'true' : 'false'}
      data-playing={playing ? 'true' : 'false'} data-canvas={canvas.canvas} data-reduced-motion={reducedMotion ? 'true' : 'false'}>
      <div className={styles.toolbar}>
        <p className={styles.historyDate} aria-live="polite" data-testid="history-date"><strong>{label}</strong> · {tSeason(season)}</p>
      </div>
      {frame.reconstructed ? (
        <Alert tone="info"><span data-testid="history-reconstructed">{firstPlan ? t('reconstructedBefore', { date: f.dateTime(new Date(`${firstPlan}T12:00:00Z`), { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) }) : t('reconstructed')}</span></Alert>
      ) : null}
      <div ref={viewport} className={styles.viewport} data-testid="history-viewport">
        <GardenCanvas stores={stores} reducedMotion onStatus={setCanvas} />
      </div>
      <div className={styles.tools} role="group" aria-label={t('controls')}>
        <Button variant="secondary" onClick={() => go(index - 1)} disabled={index === 0} data-testid="history-prev">{t('previous')}</Button>
        <Button onClick={() => { if (index >= dates.length - 1) setIndex(0); setPlaying(!playing); }} data-testid="history-play">{playing ? t('pause') : t('play')}</Button>
        <Button variant="secondary" onClick={() => go(index + 1)} disabled={index >= dates.length - 1} data-testid="history-next">{t('next')}</Button>
        <Field label={t('step')}>{(p) => (
          <NativeSelect {...p} value={step} onChange={(e) => { const v = e.target.value; setStep(v === 'day' || v === 'month' ? v : 'week'); setIndex(0); setPlaying(false); }} data-testid="history-step">
            <option value="day">{t('step_day')}</option>
            <option value="week">{t('step_week')}</option>
            <option value="month">{t('step_month')}</option>
          </NativeSelect>
        )}</Field>
      </div>
      <input type="range" className={styles.timeline} min={0} max={Math.max(0, dates.length - 1)} value={index} onChange={(e) => go(Number(e.target.value))}
        aria-label={t('timeline')} aria-valuetext={label} data-testid="history-timeline" />
    </div>
  );
}
