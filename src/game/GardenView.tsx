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
import type { SceneAvatar, SceneCulture, SceneDecor, SceneSnapshot, SceneZone } from '@/features/scene/snapshot.schema';
import { declareDecorPracticeAction } from '@/features/decor/actions';
import { Button } from '@/components/ui/Button';
import { FormError } from '@/components/ui/FormError';
import { useAction } from '@/components/ui/useAction';
import { tDynamic } from '@/i18n/dynamic';
import type { CanvasStatus, SceneStats } from './GardenCanvas';
import { createCameraStore, createDraftStore, createSceneStore, createSelectionStore, type GameStores } from './stores';
import { ViewToggle } from './ViewToggle';
import { fitCamera, fitRect, pxPerCm, useViewportGestures, WorldLayer } from './viewport';
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
const DOUBLE_TAP_MS = 300;

/** Vue jardin gamifiée (SPEC §9, PAGES.md §4 `/`). */
export function GardenView({ snapshot, problems }: { snapshot: SceneSnapshot; problems: { code: string; category: string }[] }) {
  const t = useTranslations('scene');
  const router = useRouter();
  const stores = useMemo<GameStores>(() => ({ scene: createSceneStore(snapshot), camera: createCameraStore(), selection: createSelectionStore(), draft: createDraftStore() }), []); // eslint-disable-line react-hooks/exhaustive-deps
  const scene = useStore(stores.scene, (s) => s.snapshot);
  const selected = useStore(stores.selection, (s) => s.selected);
  const [status, setStatus] = useState<CanvasStatus>({ canvas: 'loading', ticker: false });
  const [stats, setStats] = useState<SceneStats | null>(null);
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
  // FIL-05 : un seul élément par culture, qui annonce son nombre réel (ou estimé) de plants.
  const plantsLabel = (c: SceneCulture) => (c.plants.source === 'input' ? t('plantsCount', { n: c.plants.count }) : c.plants.source === 'estimated' ? t('plantsEstimated', { n: c.plants.count }) : null);
  const cultureAria = (c: SceneCulture) => [c.label, zonesById.get(c.zoneId)?.name, phaseLabel(c), plantsLabel(c), ...c.states.map((s) => t(`state_${s}`))].filter(Boolean).join(', ');

  // Ordre de lecture de la scène (§9.6) : de haut en bas, puis de gauche à droite.
  const placedZones = scene.zones.filter((z) => z.geometry).sort((a, b) => (a.geometry?.y ?? 0) - (b.geometry?.y ?? 0) || (a.geometry?.x ?? 0) - (b.geometry?.x ?? 0));
  const placedCultures = scene.cultures.filter((c) => c.position).sort((a, b) => (a.position?.y ?? 0) - (b.position?.y ?? 0) || (a.position?.x ?? 0) - (b.position?.x ?? 0));
  const toPlace = { zones: scene.zones.filter((z) => !z.geometry), cultures: scene.cultures.filter((c) => !c.position) };
  const tDecor = useTranslations('decor');
  const decorName = (d: SceneDecor) => tDynamic(tDecor, `item_${d.itemCode}`, d.itemCode);
  const placedDecor = [...scene.decor].sort((a, b) => a.y - b.y || a.x - b.x);
  /** LIV-06 : la dernière action réelle et son ancienneté, jamais une activité inventée. */
  const ago = (min: number) => (min < 60 ? t('agoMinutes', { n: min }) : min < 1440 ? t('agoHours', { n: Math.floor(min / 60) }) : t('agoDays', { n: Math.floor(min / 1440) }));
  const avatarAria = (a: SceneAvatar) => (a.action
    ? t('avatarActing', { pseudo: a.pseudo, action: t(`avatarAction_${a.action}`), zone: zonesById.get(a.zoneId)?.name ?? '', ago: ago(a.ageMinutes) })
    : t('avatarNear', { pseudo: a.pseudo, zone: zonesById.get(a.zoneId)?.name ?? '' }));

  const open = (kind: 'zone' | 'culture' | 'decor', id: string) => stores.selection.getState().select({ kind, id });
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

  /** Double-tap sur une zone : la caméra zoome sur elle (§9.5, POL-03). */
  const zoomTo = (z: SceneZone) => {
    const el = viewport.current;
    if (!z.geometry || !el) return;
    stores.camera.setState(fitRect(scene, z.geometry, el.clientWidth, el.clientHeight));
  };

  /** Deux touchers sur la même zone à moins de 300 ms : zoom ; sinon le toucher ouvre sa feuille. */
  const lastTap = useRef<{ id: string; at: number } | null>(null);
  const tapZone = (z: SceneZone, now: number) => {
    const double = lastTap.current?.id === z.id && now - lastTap.current.at < DOUBLE_TAP_MS;
    lastTap.current = double ? null : { id: z.id, at: now };
    if (double) zoomTo(z);
    else open('zone', z.id);
  };

  const selectedZone = selected?.kind === 'zone' ? zonesById.get(selected.id) : undefined;
  const selectedCulture = selected?.kind === 'culture' ? scene.cultures.find((c) => c.id === selected.id) : undefined;
  const selectedDecor = selected?.kind === 'decor' ? scene.decor.find((d) => d.id === selected.id) : undefined;

  return (
    <div className={styles.root} data-testid="garden-view" data-canvas={status.canvas} data-ticker={status.ticker ? 'running' : 'stopped'}
      data-season={stats?.season ?? ''} data-terrain-tiles={stats?.terrainTiles ?? 0} data-terrain-transitions={stats?.terrainTransitions ?? 0}
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
        <GardenCanvas stores={stores} reducedMotion={reducedMotion} onStatus={setStatus} onStats={setStats} />
        <WorldLayer stores={stores} label={t('worldLabel')}>
          {placedZones.map((z) => z.geometry ? (
            <button key={z.id} type="button" ref={(el) => { if (el) entityRefs.current.set(z.id, el); }} className={`${styles.entity} ${styles.zone}`} data-testid={`zone-${z.id}`}
              data-type={z.typeCode} aria-label={z.label} style={{ left: z.geometry.x * k, top: z.geometry.y * k, width: z.geometry.w * k, height: z.geometry.h * k, zIndex: z.depth + 1 }}
              onFocus={() => reveal((z.geometry?.x ?? 0) + (z.geometry?.w ?? 0) / 2, (z.geometry?.y ?? 0) + (z.geometry?.h ?? 0) / 2)}
              onClick={(e) => tapZone(z, e.timeStamp)} onDoubleClick={() => zoomTo(z)} />
          ) : null)}
          {placedCultures.map((c) => c.position ? (
            <button key={c.id} type="button" ref={(el) => { if (el) entityRefs.current.set(c.id, el); }} className={`${styles.entity} ${styles.culture}`} data-testid={`culture-${c.id}`}
              data-phase={c.phase} data-state={c.states.join(' ')} data-plants={c.plants.drawn} aria-label={cultureAria(c)}
              style={{ left: `calc(${c.position.x * k}px - var(--touch-min) / 2)`, top: `calc(${c.position.y * k}px - var(--touch-min))` }} onFocus={() => reveal(c.position?.x ?? 0, c.position?.y ?? 0)} onClick={() => open('culture', c.id)} />
          ) : null)}
          {placedDecor.map((d) => (
            <button key={d.id} type="button" ref={(el) => { if (el) entityRefs.current.set(d.id, el); }} className={`${styles.entity} ${styles.decor}`} data-testid={`decor-${d.id}`}
              data-item={d.itemCode} data-state={d.practiceDeclared ? 'practice' : ''} aria-label={d.label ? `${decorName(d)} « ${d.label} »` : decorName(d)}
              style={{ left: `calc(${d.x * k}px - var(--touch-min) / 2)`, top: `calc(${d.y * k}px - var(--touch-min))` }} onFocus={() => reveal(d.x, d.y)} onClick={() => open('decor', d.id)} />
          ))}
          {/* Avatars (§9.5) : repères non contrôlables, annoncés par la liste textuelle. */}
          {scene.avatars.map((a) => (
            <span key={a.userId} className={`${styles.entity} ${styles.avatar}`} role="img" data-testid={`avatar-${a.userId}`} data-zone-id={a.zoneId} aria-label={avatarAria(a)}
              data-avatar-action={a.action ?? ''} data-avatar-animated={reducedMotion ? 'false' : 'true'}
              style={{ left: `calc(${a.position.x * k}px - var(--touch-min) / 2)`, top: `calc(${a.position.y * k}px - var(--touch-min))`, pointerEvents: 'none' }} />
          ))}
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
      {selectedDecor ? <DecorSheet d={selectedDecor} name={decorName(selectedDecor)} snapshot={scene} onClose={close} /> : null}
      {selectedZone ? (
        <ZoneSheet z={selectedZone} cultures={scene.cultures.filter((c) => c.zoneId === selectedZone.id || isDescendant(scene.zones, c.zoneId, selectedZone.id))} gardenId={scene.gardenId}
          onEnter={() => goScene(selectedZone.id)} onClose={close} />
      ) : null}

      <details className={styles.drawer} data-testid="scene-list">
        <summary>{t('listTitle')}</summary>
        <ul>
          {placedZones.map((z) => <li key={z.id}><button type="button" className={styles.linkish} onClick={() => open('zone', z.id)}>{z.label}</button></li>)}
          {placedCultures.map((c) => <li key={c.id}><button type="button" className={styles.linkish} onClick={() => open('culture', c.id)}>{cultureAria(c)}</button></li>)}
          {placedDecor.map((d) => <li key={d.id}><button type="button" className={styles.linkish} onClick={() => open('decor', d.id)}>{decorName(d)}</button></li>)}
          {scene.avatars.map((a) => <li key={a.userId} data-testid={`avatar-item-${a.userId}`}>{avatarAria(a)}</li>)}
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

/** Feuille d'un objet de déco : un objet ★ peut être déclaré comme pratique réelle du jardin (DEC-03). */
function DecorSheet({ d, name, snapshot, onClose }: { d: SceneDecor; name: string; snapshot: SceneSnapshot; onClose: () => void }) {
  const t = useTranslations('decor');
  const ts = useTranslations('scene');
  const tp = useTranslations('practices');
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, [d.id]);
  const declare = useAction(declareDecorPracticeAction);
  const practice = d.practiceCode ? tDynamic(tp, d.practiceCode, d.practiceCode) : '';
  return (
    <aside className={styles.sheet} data-testid="scene-sheet" aria-labelledby="scene-sheet-title" onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}>
      <div className={styles.sheetHead}>
        <h2 id="scene-sheet-title" ref={heading} tabIndex={-1}>{name}</h2>
        <button type="button" className={styles.close} onClick={onClose} aria-label={ts('close')} data-testid="sheet-close">×</button>
      </div>
      {d.label ? <p>« {d.label} »</p> : null}
      {d.practiceCode && d.practiceDeclared ? <p data-testid="decor-practice-declared">{t('declared', { practice })}</p> : null}
      {d.practiceCode && !d.practiceDeclared && snapshot.viewer.canDeclarePractice ? (
        <>
          <p className={styles.muted}>{t('declareHelp')}</p>
          <FormError error={declare.error} />
          <Button onClick={() => void declare.run({ gardenId: snapshot.gardenId, placementId: d.id })} disabled={declare.pending} data-testid="decor-declare">{t('declare')}</Button>
        </>
      ) : null}
      <div className={styles.sheetLinks}>
        {snapshot.viewer.canPlaceDecor ? <Link href={`/app/jardins/${snapshot.gardenId}/plan${snapshot.sceneZoneId ? `?scene=${snapshot.sceneZoneId}` : ''}`}>{t('editInPlan')}</Link> : null}
      </div>
    </aside>
  );
}
