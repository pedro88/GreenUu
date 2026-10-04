'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useStore } from 'zustand';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogActions, DialogClose } from '@/components/ui/Dialog';
import { Field, NativeSelect, TextInput } from '@/components/ui/Field';
import { decorRect, deduceParent, sceneBounds, TILE_PX, TILE_SIZES_CM, tileAt, tilesToGeometry, type Tile } from '@/features/scene/grid.pure';
import { replay, validateLocal, type EditorScene, type LocalIssue, type ZoneTypeInfo } from '@/features/scene/plan.pure';
import { TMP_PREFIX, type PlanCommand } from '@/features/scene/plan.schema';
import { applyPlanCommandsAction } from '@/features/scene/actions';
import type { SceneSnapshot, SceneZone } from '@/features/scene/snapshot.schema';
import { useZoneTypeLabel } from '@/features/zone/ui/zoneLabels';
import { TERRAIN_KINDS, type TerrainKind } from '@/lib/enums';
import type { DecorCatalog } from '@/features/decor/service';
import { useUnlockLabel } from '@/features/progression/ui/unlockLabel';
import type { SceneDecor } from '@/features/scene/snapshot.schema';
import { tDynamic } from '@/i18n/dynamic';
import type { RectGeometry } from '@/features/zone/tree';
import type { CanvasStatus } from './GardenCanvas';
import { createCameraStore, createDraftStore, createHistoryStore, createSceneStore, createSelectionStore, type GameStores, type Tool } from './stores';
import { fitCamera, useViewportGestures } from './viewport';
import styles from './GardenView.module.scss';

const GardenCanvas = dynamic(() => import('./GardenCanvas'), { ssr: false });

/** Enregistrement automatique 1,5 s après le dernier geste (§9.7). */
const AUTOSAVE_MS = 1500;

type ZoneTypeOption = { id: string; code: string; label: string; isCustom: boolean; hasInteriorDefault: boolean; canHostCultures: boolean };
type Status = 'saved' | 'pending' | 'saving' | 'conflict' | 'error';

const baseOf = (s: SceneSnapshot): EditorScene => ({ tileSizeCm: s.tileSizeCm, zones: s.zones, terrain: s.terrain, decor: s.decor });
let tmpSeq = 0;
const tmpId = () => `${TMP_PREFIX}${Date.now().toString(36)}${(tmpSeq += 1)}`;

/** Remplace, dans les commandes restantes, les identifiants `tmp:` confirmés par le serveur. */
function remap(cmds: PlanCommand[], ids: Record<string, string>): PlanCommand[] {
  const r = (v: string) => ids[v] ?? v;
  return cmds.map((c) => {
    switch (c.op) {
      case 'createZone': return { ...c, parentId: c.parentId ? r(c.parentId) : null };
      case 'resizeZone': case 'moveZone': case 'archiveZone': return { ...c, zoneId: r(c.zoneId) };
      case 'removeTerrain': return { ...c, terrainId: r(c.terrainId) };
      case 'moveDecor': case 'removeDecor': return { ...c, decorId: r(c.decorId) };
      default: return c;
    }
  });
}

/** Éditeur de plan (SPEC §9.7, PAGES.md §4 `/plan`). */
export function PlanEditor({ snapshot, zoneTypes, decorCatalog }: { snapshot: SceneSnapshot; zoneTypes: ZoneTypeOption[]; decorCatalog: DecorCatalog }) {
  const t = useTranslations('plan');
  const tTerrain = useTranslations('terrainKinds');
  const tDecor = useTranslations('decor');
  const tPractices = useTranslations('practices');
  const unlockLabel = useUnlockLabel();
  const typeLabel = useZoneTypeLabel();
  const router = useRouter();
  const types = useMemo(() => new Map<string, ZoneTypeInfo>(zoneTypes.map((z) => [z.id, { id: z.id, code: z.code, label: typeLabel(z), canHostCultures: z.canHostCultures, hasInteriorDefault: z.hasInteriorDefault }])), [zoneTypes]); // eslint-disable-line react-hooks/exhaustive-deps
  const history = useMemo(() => createHistoryStore(baseOf(snapshot), snapshot.planVersion, types), []); // eslint-disable-line react-hooks/exhaustive-deps
  const stores = useMemo<GameStores>(() => ({ scene: createSceneStore({ ...snapshot, cultures: [], avatars: [] }), camera: createCameraStore(), selection: createSelectionStore(), draft: createDraftStore() }), []); // eslint-disable-line react-hooks/exhaustive-deps
  const current = useStore(history, (h) => h.current);
  const done = useStore(history, (h) => h.done);
  const undone = useStore(history, (h) => h.undone);
  const canEdit = snapshot.viewer.canEditPlan;
  /** La déco a sa propre permission (`decor:place`), souvent plus large que l'édition du plan (§5.2). */
  const canDecor = snapshot.viewer.canPlaceDecor;
  const canAny = canEdit || canDecor;
  const [decorCode, setDecorCode] = useState<string>(decorCatalog.find((d) => d.unlocked)?.code ?? '');
  const [signLabel, setSignLabel] = useState('');
  const [decorHint, setDecorHint] = useState<string | null>(null);
  const [removing, setRemoving] = useState<SceneDecor | null>(null);
  const [tool, setTool] = useState<Tool>('select');
  const [zoneTypeId, setZoneTypeId] = useState(zoneTypes.find((z) => z.code === 'bed')?.id ?? zoneTypes[0]?.id ?? '');
  const [terrainKind, setTerrainKind] = useState<TerrainKind>('path');
  const [status, setStatus] = useState<Status>('saved');
  const [issue, setIssue] = useState<LocalIssue | null>(null);
  const [conflicts, setConflicts] = useState<number>(0);
  const [placing, setPlacing] = useState<string | null>(null);
  const [erasing, setErasing] = useState<SceneZone | null>(null);
  const [canvas, setCanvas] = useState<CanvasStatus>({ canvas: 'loading', ticker: false });
  const viewport = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  /** Dernier enregistrement confirmé : nombre de commandes envoyées et identifiants attribués aux `tmp:`. */
  const confirmed = useRef<{ count: number; ids: Record<string, string> } | null>(null);
  const conflictPending = useRef(false);
  const saveTimer = useRef<number | null>(null);
  /**
   * Enregistrement en cours, ou en attente de l'instantané qui en résulte (pendant ce temps, `done` contient encore les
   * commandes envoyées). Lu à l'exécution, pas dans une fermeture : un seul enregistrement à la fois (audit lot 7, M3).
   */
  const inFlight = useRef(false);
  const resaveAfter = useRef(false);
  const drag = useRef<{ start: Tile; mode: 'draw' | 'move' | 'resize' | 'decor'; zone?: SceneZone; decor?: SceneDecor } | null>(null);

  // L'état local (base + commandes non confirmées) alimente le canvas comme un instantané.
  useEffect(() => history.subscribe((h) => {
    const rects = [...h.current.zones.flatMap((z) => (z.geometry ? [z.geometry] : [])), ...h.current.terrain.map((x) => x.geometry), ...h.current.decor.map((d) => decorRect(d, h.current.tileSizeCm))];
    stores.scene.getState().setSnapshot({ ...snapshot, tileSizeCm: h.current.tileSizeCm, zones: h.current.zones, terrain: h.current.terrain, decor: h.current.decor, cultures: [], avatars: [], bounds: sceneBounds(rects, h.current.tileSizeCm) });
  }), [history, stores, snapshot]);


  const fit = () => stores.camera.setState(fitCamera(stores.scene.getState().snapshot, viewport.current?.clientWidth ?? 360, viewport.current?.clientHeight ?? 480));
  useEffect(fit, []); // eslint-disable-line react-hooks/exhaustive-deps
  useViewportGestures(viewport, stores, { enabled: () => tool === 'select' && !drag.current });

  // `data-tile-px` et `data-origin-*` suivent la caméra : Playwright convertit des tuiles en pixels (§9.6).
  useEffect(() => {
    const apply = (c: { x: number; y: number; zoom: number }) => {
      const el = gridRef.current;
      if (!el) return;
      el.dataset.tilePx = String(TILE_PX * c.zoom);
      el.dataset.originX = String(c.x);
      el.dataset.originY = String(c.y);
    };
    apply(stores.camera.getState());
    return stores.camera.subscribe(apply);
  }, [stores]);

  const save = async () => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    const h = history.getState();
    if (!h.done.length) return;
    if (inFlight.current) {
      // Un geste pendant un enregistrement : on réenregistre quand la nouvelle base sera arrivée.
      resaveAfter.current = true;
      return;
    }
    inFlight.current = true;
    const sent = h.done;
    setStatus('saving');
    const res = await applyPlanCommandsAction({ gardenId: snapshot.gardenId, sceneZoneId: snapshot.sceneZoneId, baseVersion: h.baseVersion, commands: sent });
    if (res.ok) {
      confirmed.current = { count: sent.length, ids: res.data.ids };
      setStatus(history.getState().done.length > sent.length ? 'pending' : 'saved');
      setConflicts(0);
      router.refresh();
    } else if (res.error.code === 'CONFLICT' && res.error.message === 'planVersionConflict') {
      // PLN-03 : on recharge l'instantané, puis on rejoue les commandes non confirmées (effet ci-dessus).
      conflictPending.current = true;
      setStatus('conflict');
      router.refresh();
    } else {
      inFlight.current = false;
      setStatus('error');
    }
  };
  const schedule = () => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void save(), AUTOSAVE_MS);
  };
  useEffect(() => () => { if (saveTimer.current) window.clearTimeout(saveTimer.current); }, []);

  /** Un geste validé localement (RG-ZON-05) devient une commande ; sinon on explique pourquoi. */
  const push = (cmd: PlanCommand) => {
    const problem = validateLocal(history.getState().current, cmd);
    setIssue(problem);
    if (problem) return false;
    history.getState().push(cmd);
    setStatus('pending');
    schedule();
    return true;
  };

  // Nouvel instantané du serveur (après enregistrement ou rechargement) : nouvelle base, commandes restantes rejouées.
  useEffect(() => {
    if (snapshot.planVersion === history.getState().baseVersion && !conflictPending.current) return;
    inFlight.current = false;
    if (conflictPending.current) {
      conflictPending.current = false;
      resaveAfter.current = false;
      const r = replay(baseOf(snapshot), history.getState().done, types);
      setConflicts(r.conflicts.length);
      history.getState().reset(baseOf(snapshot), snapshot.planVersion, r.kept);
      setStatus(r.kept.length ? 'pending' : 'conflict');
      if (r.kept.length) schedule();
      return;
    }
    // Gestes faits pendant l'enregistrement (jusqu'à l'arrivée de cet instantané) : rejoués sur la nouvelle base.
    const c = confirmed.current;
    const pending = c ? remap(history.getState().done.slice(c.count), c.ids) : [];
    history.getState().reset(baseOf(snapshot), snapshot.planVersion, pending);
    confirmed.current = null;
    if (pending.length || resaveAfter.current) {
      resaveAfter.current = false;
      if (pending.length) schedule();
    }
  }, [snapshot]); // eslint-disable-line react-hooks/exhaustive-deps

  const sceneZones = current.zones;
  const createAt = (geometry: RectGeometry, name?: string, parentOverride?: string | null) => {
    const parent = parentOverride !== undefined ? (parentOverride ? sceneZones.find((z) => z.id === parentOverride) ?? null : null) : deduceParent(geometry, sceneZones);
    const type = types.get(zoneTypeId);
    const n = sceneZones.filter((z) => z.typeCode === type?.code).length + 1;
    return push({ op: 'createZone', clientId: tmpId(), name: name ?? t('newZoneName', { type: type?.label ?? '', n }), zoneTypeId, parentId: parent?.id ?? null, geometry });
  };

  // ---- Gestes sur la grille ----
  const cmAt = (e: ReactPointerEvent) => {
    const box = gridRef.current?.getBoundingClientRect();
    const c = stores.camera.getState();
    const s = TILE_PX / current.tileSizeCm;
    return { x: ((e.clientX - (box?.left ?? 0) - c.x) / c.zoom) / s, y: ((e.clientY - (box?.top ?? 0) - c.y) / c.zoom) / s };
  };
  const zoneAt = (p: { x: number; y: number }) => sceneZones.filter((z) => z.geometry && p.x >= z.geometry.x && p.y >= z.geometry.y && p.x < z.geometry.x + z.geometry.w && p.y < z.geometry.y + z.geometry.h)
    .sort((a, b) => b.depth - a.depth)[0];
  /** Emprise d'un objet : pied au bas centre, `w` × `h` tuiles à l'échelle courante. */
  const decorAt = (p: { x: number; y: number }) => {
    const k = current.tileSizeCm;
    return [...current.decor].reverse().find((d) => p.x >= d.x - (d.w * k) / 2 && p.x < d.x + (d.w * k) / 2 && p.y >= d.y - d.h * k && p.y < d.y);
  };
  /** Pied d'un objet posé sur une tuile : bas de la tuile, centré sur son emprise. */
  const footAt = (tile: Tile, w: number) => ({ x: Math.max(0, Math.round(tile.x * current.tileSizeCm + (w * current.tileSizeCm) / 2)), y: (tile.y + 1) * current.tileSizeCm });
  const terrainAt = (p: { x: number; y: number }) => current.terrain.find((x) => p.x >= x.geometry.x && p.y >= x.geometry.y && p.x < x.geometry.x + x.geometry.w && p.y < x.geometry.y + x.geometry.h);

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!canAny) return;
    const p = cmAt(e);
    const tile = tileAt(p.x, p.y, current.tileSizeCm);
    if (tool === 'decor') {
      const item = decorCatalog.find((d) => d.code === decorCode);
      if (!canDecor || !item) return;
      if (!item.unlocked) { setDecorHint(tDecor('lockedHint', { condition: unlockLabel(item.condition) })); return; }
      const foot = footAt(tile, item.w);
      push({ op: 'placeDecor', clientId: tmpId(), itemCode: item.code, x: foot.x, y: foot.y, label: item.code === 'sign' && signLabel.trim() ? signLabel.trim().slice(0, 40) : null });
      return;
    }
    const d = canDecor && (tool === 'select' || tool === 'eraser') ? decorAt(p) : undefined;
    if (d && tool === 'eraser') {
      if (d.practiceDeclared) setRemoving(d);
      else push({ op: 'removeDecor', decorId: d.id, removePractice: false });
      return;
    }
    if (d) {
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = { start: tile, mode: 'decor', decor: d };
      return;
    }
    if (!canEdit) return;
    if (tool === 'zone' || tool === 'terrain') {
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = { start: tile, mode: 'draw' };
      stores.draft.getState().set(tilesToGeometry(tile, tile, current.tileSizeCm));
      return;
    }
    if (tool === 'eraser') {
      const z = zoneAt(p);
      const terrain = terrainAt(p);
      if (terrain && (!z || z.depth === 0)) push({ op: 'removeTerrain', terrainId: terrain.id });
      else if (z) setErasing(z);
      return;
    }
    const z = zoneAt(p);
    stores.selection.getState().select(z ? { kind: 'zone', id: z.id } : null);
    if (z?.geometry) {
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      const g = z.geometry;
      const corner = tileAt(g.x + g.w - 1, g.y + g.h - 1, current.tileSizeCm);
      drag.current = { start: tile, mode: tile.x === corner.x && tile.y === corner.y ? 'resize' : 'move', zone: z };
    }
  };
  const draftFor = (d: NonNullable<typeof drag.current>, tile: Tile): RectGeometry | null => {
    const size = current.tileSizeCm;
    if (d.mode === 'decor' && d.decor) {
      const foot = footAt(tile, d.decor.w);
      return { v: 1, kind: 'rect', x: foot.x - (d.decor.w * size) / 2, y: foot.y - d.decor.h * size, w: d.decor.w * size, h: d.decor.h * size };
    }
    if (d.mode === 'draw') return tilesToGeometry({ x: Math.max(0, d.start.x), y: Math.max(0, d.start.y) }, { x: Math.max(0, tile.x), y: Math.max(0, tile.y) }, size);
    const g = d.zone?.geometry;
    if (!g) return null;
    // La scène commence en (0, 0) : un déplacement ne sort pas par le haut ni par la gauche (M5).
    if (d.mode === 'move') return { ...g, x: Math.max(0, g.x + (tile.x - d.start.x) * size), y: Math.max(0, g.y + (tile.y - d.start.y) * size) };
    return { ...g, w: Math.max(size, g.w + (tile.x - d.start.x) * size), h: Math.max(size, g.h + (tile.y - d.start.y) * size) };
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const p = cmAt(e);
    stores.draft.getState().set(draftFor(d, tileAt(p.x, p.y, current.tileSizeCm)));
  };
  const onUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    stores.draft.getState().set(null);
    if (!d) return;
    const p = cmAt(e);
    if (d.mode === 'decor' && d.decor) {
      const foot = footAt(tileAt(p.x, p.y, current.tileSizeCm), d.decor.w);
      if (foot.x !== d.decor.x || foot.y !== d.decor.y) push({ op: 'moveDecor', decorId: d.decor.id, x: foot.x, y: foot.y });
      return;
    }
    const g = draftFor(d, tileAt(p.x, p.y, current.tileSizeCm));
    if (!g) return;
    if (d.mode === 'draw' && tool === 'terrain') push({ op: 'addTerrain', clientId: tmpId(), kind: terrainKind, geometry: g });
    else if (d.mode === 'draw' && placing) { if (push({ op: 'resizeZone', zoneId: placing, geometry: g })) setPlacing(null); }
    else if (d.mode === 'draw') createAt(g);
    else if (d.zone && (g.x !== d.zone.geometry?.x || g.y !== d.zone.geometry?.y || g.w !== d.zone.geometry?.w || g.h !== d.zone.geometry?.h)) {
      push({ op: d.mode === 'move' ? 'moveZone' : 'resizeZone', zoneId: d.zone.id, geometry: g });
    }
  };

  // Annuler / rétablir au clavier.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || !canAny) return;
      if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); history.getState().undo(); schedule(); }
      if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) { e.preventDefault(); history.getState().redo(); schedule(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const toPlace = sceneZones.filter((z) => !z.geometry);
  const statusText = status === 'conflict' && conflicts === 0 ? t('status_conflict') : t(`status_${status}`);

  return (
    <div className={styles.root} data-testid="plan-editor" data-canvas={canvas.canvas} data-status={status} data-plan-version={snapshot.planVersion}>
      <div className={styles.toolbar}>
        <Link href={`/app/jardins/${snapshot.gardenId}?vue=jardin${snapshot.sceneZoneId ? `&scene=${snapshot.sceneZoneId}` : ''}`}>{t('backToGarden')}</Link>
        <span className={styles.status} role="status" data-testid="plan-status">{statusText}</span>
      </div>
      {!canEdit ? <Alert tone="info"><span data-testid="plan-readonly">{canDecor ? t('readOnlyDecor') : t('readOnly')}</span></Alert> : null}
      {issue ? <Alert tone="warning"><span data-testid="plan-issue">{t('invalid', { issue: t(`issue_${issue}`) })}</span></Alert> : null}
      {conflicts > 0 ? <Alert tone="warning"><span data-testid="plan-conflicts">{t('status_conflict')} {t('conflicts', { count: conflicts })}</span></Alert> : null}

      <div className={styles.tools} role="toolbar" aria-label={t('toolsLabel')}>
        {(['select', 'zone', 'terrain', 'decor', 'eraser'] as const).map((x) => (
          <Button key={x} variant="secondary" className={styles.tool} aria-pressed={tool === x}
            disabled={x === 'select' ? false : x === 'decor' ? !canDecor : x === 'eraser' ? !canAny : !canEdit} onClick={() => { setTool(x); setDecorHint(null); }} data-testid={`tool-${x}`}>{t(`tool_${x}`)}</Button>
        ))}
        <Field label={t('zoneType')}>{(p) => (
          <NativeSelect {...p} value={zoneTypeId} disabled={!canEdit} onChange={(e) => setZoneTypeId(e.target.value)} data-testid="zone-type">
            {zoneTypes.map((z) => <option key={z.id} value={z.id}>{typeLabel(z)}</option>)}
          </NativeSelect>
        )}</Field>
        <Field label={t('terrainKind')}>{(p) => (
          <NativeSelect {...p} value={terrainKind} disabled={!canEdit} onChange={(e) => setTerrainKind(TERRAIN_KINDS.find((x) => x === e.target.value) ?? 'path')} data-testid="terrain-kind">
            {TERRAIN_KINDS.map((x) => <option key={x} value={x}>{tTerrain(x)}</option>)}
          </NativeSelect>
        )}</Field>
        <Field label={t('scale')}>{(p) => (
          <NativeSelect {...p} value={current.tileSizeCm} disabled={!canEdit} data-testid="plan-scale"
            onChange={(e) => { const v = TILE_SIZES_CM.find((x) => x === Number(e.target.value)); if (v) push({ op: 'setScale', tileSizeCm: v }); }}>
            {TILE_SIZES_CM.map((x) => <option key={x} value={x}>{t('scaleOption', { cm: x })}</option>)}
          </NativeSelect>
        )}</Field>
        <Button variant="secondary" disabled={!canAny || !done.length} onClick={() => { history.getState().undo(); schedule(); }} data-testid="plan-undo">{t('undo')}</Button>
        <Button variant="secondary" disabled={!canAny || !undone.length} onClick={() => { history.getState().redo(); schedule(); }} data-testid="plan-redo">{t('redo')}</Button>
        <Button disabled={!canAny || !done.length || status === 'saving'} onClick={() => void save()} data-testid="plan-save">{t('save')}</Button>
      </div>
      {tool === 'decor' ? (
        <div className={styles.decorPalette} role="group" aria-label={tDecor('paletteLabel')} data-testid="decor-palette">
          <ul>
            {decorCatalog.map((d) => (
              <li key={d.code}>
                <button type="button" className={styles.decorItem} aria-pressed={decorCode === d.code} aria-disabled={!d.unlocked} data-locked={d.unlocked ? 'false' : 'true'} data-testid={`decor-item-${d.code}`}
                  onClick={() => { setDecorCode(d.code); setDecorHint(d.unlocked ? null : tDecor('lockedHint', { condition: unlockLabel(d.condition) })); }}>
                  <img src={`/sprites/decor/${d.spriteKey}.png`} alt="" width={32} height={32} />
                  <span>{tDynamic(tDecor, `item_${d.code}`, d.code)}{d.practiceCode ? ' ★' : ''}</span>
                  {d.unlocked ? null : <small>{unlockLabel(d.condition)}</small>}
                </button>
              </li>
            ))}
          </ul>
          {decorCode === 'sign' ? <Field label={tDecor('signLabel')}>{(p) => <TextInput {...p} maxLength={40} value={signLabel} onChange={(e) => setSignLabel(e.target.value)} data-testid="decor-sign-label" />}</Field> : null}
          <p role="status" data-testid="decor-hint">{decorHint ?? tDecor('placeHint')}</p>
        </div>
      ) : null}
      {placing ? <Alert tone="info">{t('placing')}</Alert> : null}

      <div ref={viewport} className={styles.viewport} data-testid="plan-viewport">
        <GardenCanvas stores={stores} reducedMotion grid onStatus={setCanvas} />
        <div ref={gridRef} className={styles.planGrid} data-testid="plan-grid" data-tool={tool} data-tile-cm={current.tileSizeCm} role="application" aria-label={t('gridLabel')}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} />
      </div>

      {canEdit ? <DimensionsForm zones={sceneZones} types={zoneTypes} typeLabel={typeLabel} defaultType={zoneTypeId}
        onSubmit={(v) => { setZoneTypeId(v.zoneTypeId); return push({ op: 'createZone', clientId: tmpId(), name: v.name, zoneTypeId: v.zoneTypeId, parentId: v.parentId, geometry: v.geometry }); }} /> : null}

      {toPlace.length ? (
        <details className={styles.drawer} data-testid="plan-to-place" open>
          <summary>{t('toPlace')}</summary>
          <ul>{toPlace.map((z) => <li key={z.id}>{z.label} {canEdit ? <Button variant="secondary" onClick={() => { setPlacing(z.id); setTool('zone'); }} data-testid={`place-${z.id}`}>{t('place')}</Button> : null}</li>)}</ul>
        </details>
      ) : null}

      <Dialog open={removing !== null} onOpenChange={(o) => { if (!o) setRemoving(null); }} title={tDecor('removeTitle', { name: removing ? tDynamic(tDecor, `item_${removing.itemCode}`, removing.itemCode) : '' })}>
        <p>{tDecor('removePracticeQuestion', { practice: removing?.practiceCode ? tDynamic(tPractices, removing.practiceCode, removing.practiceCode) : '' })}</p>
        <DialogActions>
          <Button variant="secondary" data-testid="decor-remove-keep" onClick={() => { if (removing) push({ op: 'removeDecor', decorId: removing.id, removePractice: false }); setRemoving(null); }}>{tDecor('removeKeepPractice')}</Button>
          <Button data-testid="decor-remove-with-practice" disabled={!snapshot.viewer.canDeclarePractice} onClick={() => { if (removing) push({ op: 'removeDecor', decorId: removing.id, removePractice: true }); setRemoving(null); }}>{tDecor('removeWithPractice')}</Button>
        </DialogActions>
      </Dialog>
      <Dialog open={erasing !== null} onOpenChange={(o) => { if (!o) setErasing(null); }} title={t('eraseTitle', { name: erasing?.name ?? '' })}>
        <p>{t('eraseHistory')}</p>
        <DialogActions>
          <DialogClose asChild><Button variant="secondary">{t('cancel')}</Button></DialogClose>
          <Button data-testid="erase-confirm" onClick={() => { if (erasing) push({ op: 'archiveZone', zoneId: erasing.id, finishActiveCultures: true }); setErasing(null); }}>{t('eraseConfirm')}</Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}

/** Formulaire alternatif (§9.6, PLN-02) : produit la même commande que le dessin à la souris. */
function DimensionsForm({ zones, types, typeLabel, defaultType, onSubmit }: {
  zones: SceneZone[]; types: ZoneTypeOption[]; typeLabel: (z: ZoneTypeOption) => string; defaultType: string;
  onSubmit: (v: { name: string; zoneTypeId: string; parentId: string | null; geometry: RectGeometry }) => boolean;
}) {
  const t = useTranslations('plan');
  const [v, setV] = useState({ name: '', zoneTypeId: defaultType, parentId: '', x: 0, y: 0, w: 100, h: 100 });
  const num = (key: 'x' | 'y' | 'w' | 'h', label: string) => (
    <Field label={label}>{(p) => <TextInput {...p} inputMode="numeric" value={v[key]} onChange={(e) => setV({ ...v, [key]: Number(e.target.value) || 0 })} data-testid={`dims-${key}`} />}</Field>
  );
  return (
    <form method="post" className={styles.drawer} data-testid="zone-form-dims" onSubmit={(e) => {
      e.preventDefault();
      if (onSubmit({ name: v.name.trim() || typeLabel(types.find((x) => x.id === v.zoneTypeId) ?? { id: '', code: '', label: '', isCustom: true, hasInteriorDefault: false, canHostCultures: true }), zoneTypeId: v.zoneTypeId, parentId: v.parentId || null, geometry: { v: 1, kind: 'rect', x: v.x, y: v.y, w: v.w, h: v.h } })) setV({ ...v, name: '' });
    }}>
      <h2>{t('dimsTitle')}</h2>
      <div className={styles.dims}>
        <Field label={t('dimsName')}>{(p) => <TextInput {...p} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} data-testid="dims-name" />}</Field>
        <Field label={t('zoneType')}>{(p) => (
          <NativeSelect {...p} value={v.zoneTypeId} onChange={(e) => setV({ ...v, zoneTypeId: e.target.value })} data-testid="dims-type">
            {types.map((z) => <option key={z.id} value={z.id}>{typeLabel(z)}</option>)}
          </NativeSelect>
        )}</Field>
        <Field label={t('dimsParent')}>{(p) => (
          <NativeSelect {...p} value={v.parentId} onChange={(e) => setV({ ...v, parentId: e.target.value })} data-testid="dims-parent">
            <option value="">{t('dimsNoParent')}</option>
            {zones.map((z) => <option key={z.id} value={z.id}>{z.label}</option>)}
          </NativeSelect>
        )}</Field>
        {num('x', t('dimsX'))}{num('y', t('dimsY'))}{num('w', t('dimsW'))}{num('h', t('dimsH'))}
        <Button type="submit" data-testid="dims-submit">{t('dimsSubmit')}</Button>
      </div>
    </form>
  );
}
