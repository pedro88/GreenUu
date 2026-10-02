'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { LinkButton } from '@/components/ui/Button';
import { QuickCapture } from '@/features/culture/ui/QuickCapture';
import { MAX_VISIBLE_STATES } from '@/features/scene/phase.pure';
import type { SceneCulture, SceneSnapshot, SceneZone } from '@/features/scene/snapshot.schema';
import type { CanvasStatus } from './GardenCanvas';
import { createCameraStore, createDraftStore, createSceneStore, createSelectionStore, type GameStores } from './stores';
import { ViewToggle } from './ViewToggle';
import { fitCamera, pxPerCm, useViewportGestures, WorldLayer } from './viewport';
import styles from './GardenView.module.scss';

// §9.1 : PixiJS n'est chargé que par la vue jardin, sans SSR ; la couche accessible s'affiche avant le canvas.
const GardenCanvas = dynamic(() => import('./GardenCanvas'), { ssr: false });

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

const FADE_MS = 300;

/** Vue jardin gamifiée (SPEC §9, PAGES.md §4 `/`). */
export function GardenView({ snapshot, problems }: { snapshot: SceneSnapshot; problems: { code: string; category: string }[] }) {
  const t = useTranslations('scene');
  const router = useRouter();
  const stores = useMemo<GameStores>(() => ({ scene: createSceneStore(snapshot), camera: createCameraStore(), selection: createSelectionStore(), draft: createDraftStore() }), []); // eslint-disable-line react-hooks/exhaustive-deps
  const scene = useStore(stores.scene, (s) => s.snapshot);
  const selected = useStore(stores.selection, (s) => s.selected);
  const [status, setStatus] = useState<CanvasStatus>({ canvas: 'loading', ticker: false });
  // Scène visée par une transition en cours ; le fondu s'arrête quand l'instantané de cette scène arrive.
  const [fadeTarget, setFadeTarget] = useState<string | null | undefined>(undefined);
  const viewport = useRef<HTMLDivElement>(null);
  const entityRefs = useRef(new Map<string, HTMLButtonElement>());
  const prefersReduced = usePrefersReducedMotion();
  const reducedMotion = prefersReduced || scene.viewer.reducedMotion;

  const recenter = () => {
    stores.camera.setState(fitCamera(stores.scene.getState().snapshot, viewport.current?.clientWidth ?? 360, viewport.current?.clientHeight ?? 480));
  };
  // Nouvel instantané (revalidation, changement de scène) : appliqué au store, caméra recadrée si la scène change.
  useEffect(() => {
    const prev = stores.scene.getState().snapshot;
    stores.scene.getState().setSnapshot(snapshot);
    if (prev.sceneZoneId !== snapshot.sceneZoneId || prev.tileSizeCm !== snapshot.tileSizeCm) recenter();
  }, [snapshot]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(recenter, []); // eslint-disable-line react-hooks/exhaustive-deps
  const fading = fadeTarget !== undefined && fadeTarget !== scene.sceneZoneId;
  useViewportGestures(viewport, stores, { enabled: () => true });

  const k = pxPerCm(scene);
  const zonesById = new Map(scene.zones.map((z) => [z.id, z]));
  const phaseLabel = (c: SceneCulture) => t(`phase_${c.phase}`);
  const cultureAria = (c: SceneCulture) => [c.label, zonesById.get(c.zoneId)?.name, phaseLabel(c), ...c.states.map((s) => t(`state_${s}`))].filter(Boolean).join(', ');

  // Ordre de lecture de la scène (§9.6) : de haut en bas, puis de gauche à droite.
  const placedZones = scene.zones.filter((z) => z.geometry).sort((a, b) => (a.geometry?.y ?? 0) - (b.geometry?.y ?? 0) || (a.geometry?.x ?? 0) - (b.geometry?.x ?? 0));
  const placedCultures = scene.cultures.filter((c) => c.position).sort((a, b) => (a.position?.y ?? 0) - (b.position?.y ?? 0) || (a.position?.x ?? 0) - (b.position?.x ?? 0));
  const toPlace = { zones: scene.zones.filter((z) => !z.geometry), cultures: scene.cultures.filter((c) => !c.position) };

  const open = (kind: 'zone' | 'culture', id: string) => stores.selection.getState().select({ kind, id });
  const close = () => {
    const id = stores.selection.getState().selected?.id;
    stores.selection.getState().select(null);
    if (id) entityRefs.current.get(id)?.focus();
  };
  const sceneHref = (zoneId: string | null) => `/app/jardins/${scene.gardenId}?vue=jardin${zoneId ? `&scene=${zoneId}` : ''}`;
  const goScene = (zoneId: string | null) => {
    stores.selection.getState().select(null);
    // Transition de 300 ms, instantanée en animations réduites (§9.1, MAP-09).
    if (reducedMotion) { router.push(sceneHref(zoneId)); return; }
    setFadeTarget(zoneId);
    window.setTimeout(() => router.push(sceneHref(zoneId)), FADE_MS);
  };
  /** Le focus clavier amène l'élément à l'écran (A11Y-03). */
  const reveal = (cx: number, cy: number) => {
    const el = viewport.current;
    if (!el) return;
    const c = stores.camera.getState();
    const sx = cx * k * c.zoom + c.x;
    const sy = cy * k * c.zoom + c.y;
    if (sx < 24 || sy < 24 || sx > el.clientWidth - 24 || sy > el.clientHeight - 24) {
      stores.camera.setState({ x: Math.round(el.clientWidth / 2 - cx * k * c.zoom), y: Math.round(el.clientHeight / 2 - cy * k * c.zoom) });
    }
  };

  const selectedZone = selected?.kind === 'zone' ? zonesById.get(selected.id) : undefined;
  const selectedCulture = selected?.kind === 'culture' ? scene.cultures.find((c) => c.id === selected.id) : undefined;

  return (
    <div className={styles.root} data-testid="garden-view" data-canvas={status.canvas} data-ticker={status.ticker ? 'running' : 'stopped'}
      data-transition={reducedMotion ? 'instant' : 'fade'} data-reduced-motion={reducedMotion ? 'true' : 'false'}>
      <div className={styles.toolbar}>
        <nav aria-label={t('breadcrumb')} className={styles.breadcrumb} data-testid="scene-breadcrumb">
          {scene.breadcrumb.map((b, i) => (i === scene.breadcrumb.length - 1
            ? <span key={b.zoneId ?? 'root'} aria-current="page">{b.name}</span>
            : <Link key={b.zoneId ?? 'root'} href={sceneHref(b.zoneId)} data-testid={`breadcrumb-${b.zoneId ?? 'root'}`}>{b.name}</Link>))}
        </nav>
        <div className={styles.actions}>
          <ViewToggle gardenId={scene.gardenId} to="classic" />
          <LinkButton href={`/app/jardins/${scene.gardenId}/plan${scene.sceneZoneId ? `?scene=${scene.sceneZoneId}` : ''}`} variant="secondary" data-testid="open-plan">{t('editPlan')}</LinkButton>
        </div>
      </div>

      <div ref={viewport} className={`${styles.viewport} ${fading ? styles.fading : ''}`} data-testid="scene-viewport">
        <GardenCanvas stores={stores} reducedMotion={reducedMotion} onStatus={setStatus} />
        <WorldLayer stores={stores} label={t('worldLabel')}>
          {placedZones.map((z) => z.geometry ? (
            <button key={z.id} type="button" ref={(el) => { if (el) entityRefs.current.set(z.id, el); }} className={`${styles.entity} ${styles.zone}`} data-testid={`zone-${z.id}`}
              data-type={z.typeCode} aria-label={z.label} style={{ left: z.geometry.x * k, top: z.geometry.y * k, width: z.geometry.w * k, height: z.geometry.h * k, zIndex: z.depth + 1 }}
              onFocus={() => reveal((z.geometry?.x ?? 0) + (z.geometry?.w ?? 0) / 2, (z.geometry?.y ?? 0) + (z.geometry?.h ?? 0) / 2)}
              onClick={() => open('zone', z.id)} onDoubleClick={() => z.geometry && reveal(z.geometry.x + z.geometry.w / 2, z.geometry.y + z.geometry.h / 2)} />
          ) : null)}
          {placedCultures.map((c) => c.position ? (
            <button key={c.id} type="button" ref={(el) => { if (el) entityRefs.current.set(c.id, el); }} className={`${styles.entity} ${styles.culture}`} data-testid={`culture-${c.id}`}
              data-phase={c.phase} data-state={c.states.join(' ')} aria-label={cultureAria(c)}
              style={{ left: c.position.x * k - 16, top: c.position.y * k - 32 }} onFocus={() => reveal(c.position?.x ?? 0, c.position?.y ?? 0)} onClick={() => open('culture', c.id)} />
          ) : null)}
        </WorldLayer>
        <div className={styles.zoom} role="group" aria-label={t('zoomGroup')}>
          <button type="button" onClick={() => stores.camera.getState().zoomBy(1.5)} aria-label={t('zoomIn')} data-testid="zoom-in">+</button>
          <button type="button" onClick={() => stores.camera.getState().zoomBy(0.66)} aria-label={t('zoomOut')} data-testid="zoom-out">−</button>
          <button type="button" onClick={recenter} aria-label={t('recenter')} data-testid="zoom-reset">⌖</button>
        </div>
        {status.canvas === 'unavailable' ? <p className={styles.notice} role="status">{t('canvasUnavailable')}</p> : null}
      </div>

      {selectedCulture ? (
        <CultureSheet c={selectedCulture} zone={zonesById.get(selectedCulture.zoneId)} gardenId={scene.gardenId} problems={problems} onClose={close} />
      ) : null}
      {selectedZone ? (
        <ZoneSheet z={selectedZone} cultures={scene.cultures.filter((c) => c.zoneId === selectedZone.id || isDescendant(scene.zones, c.zoneId, selectedZone.id))} gardenId={scene.gardenId}
          onEnter={() => goScene(selectedZone.id)} onClose={close} />
      ) : null}

      <details className={styles.drawer} data-testid="scene-list">
        <summary>{t('listTitle')}</summary>
        <ul>
          {placedZones.map((z) => <li key={z.id}><button type="button" className={styles.linkish} onClick={() => open('zone', z.id)}>{z.label}</button></li>)}
          {placedCultures.map((c) => <li key={c.id}><button type="button" className={styles.linkish} onClick={() => open('culture', c.id)}>{cultureAria(c)}</button></li>)}
        </ul>
      </details>
      {toPlace.zones.length + toPlace.cultures.length > 0 ? (
        <details className={styles.drawer} data-testid="to-place">
          <summary>{t('toPlace', { count: toPlace.zones.length + toPlace.cultures.length })}</summary>
          <ul>
            {toPlace.zones.map((z) => <li key={z.id}>{z.label}</li>)}
            {toPlace.cultures.map((c) => <li key={c.id}><Link href={`/app/jardins/${scene.gardenId}/cultures/${c.id}`}>{c.label}</Link></li>)}
          </ul>
          {scene.viewer.canEditPlan ? <Link href={`/app/jardins/${scene.gardenId}/plan`}>{t('placeInEditor')}</Link> : null}
        </details>
      ) : null}
    </div>
  );
}

function isDescendant(zones: SceneZone[], zoneId: string, ancestor: string): boolean {
  let z = zones.find((x) => x.id === zoneId);
  while (z?.parentId) {
    if (z.parentId === ancestor) return true;
    const parentId: string = z.parentId;
    z = zones.find((x) => x.id === parentId);
  }
  return false;
}

/** Feuille d'une culture (§9.5) : étape, bulles expliquées en texte, actions rapides, liens. */
function CultureSheet({ c, zone, gardenId, problems, onClose }: { c: SceneCulture; zone: SceneZone | undefined; gardenId: string; problems: { code: string; category: string }[]; onClose: () => void }) {
  const t = useTranslations('scene');
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, [c.id]);
  const base = `/app/jardins/${gardenId}`;
  return (
    <aside className={styles.sheet} data-testid="scene-sheet" aria-labelledby="scene-sheet-title" onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}>
      <div className={styles.sheetHead}>
        <h2 id="scene-sheet-title" ref={heading} tabIndex={-1}>{c.label}</h2>
        <button type="button" className={styles.close} onClick={onClose} aria-label={t('close')} data-testid="sheet-close">×</button>
      </div>
      <p data-testid="sheet-stage">{t('stage', { phase: t(`phase_${c.phase}`) })}{zone ? ` · ${zone.label}` : ''}</p>
      {c.states.length ? (
        <ul className={styles.states} data-testid="sheet-states">
          {c.states.map((s, i) => <li key={s} data-visible={i < MAX_VISIBLE_STATES ? 'true' : 'false'}><strong>{t(`state_${s}`)}</strong> — {t(`stateHelp_${s}`)}</li>)}
        </ul>
      ) : <p className={styles.muted}>{t('noState')}</p>}
      <QuickCapture gardenId={gardenId} cultureId={c.id} title={c.label} problems={problems} asActions actionsClassName={styles.quickActions} />
      <div className={styles.sheetLinks}>
        <Link href={`${base}/tickets/nouveau?culture=${c.id}`} data-testid="sheet-ticket">{t('newTicket')}</Link>
        <Link href={`${base}/cultures/${c.id}`} data-testid="sheet-open">{t('openCulture')}</Link>
        <Link href={`${base}/cultures/${c.id}?onglet=taches`}>{t('tickets')}</Link>
      </div>
    </aside>
  );
}

/** Feuille d'une zone (§9.5) : cultures en cours, « Planter ici », tickets, et « Entrer » pour une serre. */
function ZoneSheet({ z, cultures, gardenId, onEnter, onClose }: { z: SceneZone; cultures: SceneCulture[]; gardenId: string; onEnter: () => void; onClose: () => void }) {
  const t = useTranslations('scene');
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, [z.id]);
  const base = `/app/jardins/${gardenId}`;
  return (
    <aside className={styles.sheet} data-testid="scene-sheet" aria-labelledby="scene-sheet-title" onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}>
      <div className={styles.sheetHead}>
        <h2 id="scene-sheet-title" ref={heading} tabIndex={-1}>{z.label}</h2>
        <button type="button" className={styles.close} onClick={onClose} aria-label={t('close')} data-testid="sheet-close">×</button>
      </div>
      <h3>{t('zoneCultures')}</h3>
      {cultures.length ? <ul className={styles.states}>{cultures.map((c) => <li key={c.id}><Link href={`${base}/cultures/${c.id}`}>{c.label}</Link> · {t(`phase_${c.phase}`)}</li>)}</ul> : <p className={styles.muted}>{t('noCulture')}</p>}
      <div className={styles.sheetLinks}>
        {z.hasInterior ? <button type="button" className={styles.primaryLink} onClick={onEnter} data-testid="zone-enter">{t('enter')}</button> : null}
        {z.canHostCultures ? <Link href={`${base}/cultures/nouvelle?zone=${z.id}`} data-testid="zone-plant">{t('plantHere')}</Link> : null}
        <Link href={`${base}/tickets/nouveau?zone=${z.id}`}>{t('newTicket')}</Link>
        <Link href={`${base}/zones/${z.id}`}>{t('openZone')}</Link>
      </div>
    </aside>
  );
}
