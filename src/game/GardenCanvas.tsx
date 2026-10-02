'use client';

import { useEffect, useRef } from 'react';
import { browserScheduler, RenderLoop } from './engine/loop';
import { createSceneView, type SceneView } from './engine/pixi-scene';
import type { GameStores } from './stores';
import styles from './GardenView.module.scss';

/** MAP-01 : marqueur posé au chargement de ce module, le seul qui importe PixiJS. */
if (typeof window !== 'undefined') Object.assign(window, { __greenuPixiLoaded: true });

export type CanvasStatus = { canvas: 'loading' | 'ready' | 'unavailable'; ticker: boolean };

/**
 * Canvas PixiJS de la vue jardin (SPEC §9.1), chargé par `next/dynamic` sans SSR. Il s'abonne aux stores, ne rend qu'à
 * la demande, et signale son état (`data-canvas`, `data-ticker`) au composant parent. React ne touche pas au rendu.
 */
export default function GardenCanvas({ stores, reducedMotion, grid = false, onStatus }: {
  stores: GameStores; reducedMotion: boolean; grid?: boolean; onStatus: (s: CanvasStatus) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const loopRef = useRef<RenderLoop | null>(null);
  const statusRef = useRef(onStatus);
  useEffect(() => { statusRef.current = onStatus; });

  useEffect(() => {
    const el = host.current;
    if (!el) return undefined;
    let disposed = false;
    let view: SceneView | null = null;
    const unsubs: (() => void)[] = [];
    void (async () => {
      try {
        view = await createSceneView(el);
      } catch {
        // Pas de WebGL : la couche accessible reste utilisable, avec un rendu de repli en CSS.
        if (!disposed) statusRef.current({ canvas: 'unavailable', ticker: false });
        return;
      }
      if (disposed) { view.destroy(); return; }
      const v = view;
      const loop = new RenderLoop({ render: (ms) => { if (loop.running) v.animate(ms); v.render(); } }, browserScheduler, { reducedMotion });
      loopRef.current = loop;
      v.setGrid(grid);
      v.setSnapshot(stores.scene.getState().snapshot);
      v.setCamera(stores.camera.getState());
      v.setSelection(stores.selection.getState().selected?.id ?? null);
      unsubs.push(
        stores.scene.subscribe((s) => { v.setSnapshot(s.snapshot); v.setSelection(stores.selection.getState().selected?.id ?? null); loop.requestRender(); }),
        stores.camera.subscribe((c) => { v.setCamera(c); loop.noteInteraction(); }),
        stores.selection.subscribe((s) => { v.setSelection(s.selected?.id ?? null); loop.noteInteraction(); }),
        stores.draft.subscribe((d) => { v.setDraft(d.rect); loop.requestRender(); }),
        loop.onRunningChange((running) => statusRef.current({ canvas: 'ready', ticker: running })),
      );
      const onVisibility = () => loop.setVisible(document.visibilityState === 'visible');
      document.addEventListener('visibilitychange', onVisibility);
      unsubs.push(() => document.removeEventListener('visibilitychange', onVisibility));
      const ro = new ResizeObserver(() => { v.setCamera(stores.camera.getState()); loop.requestRender(); });
      ro.observe(el);
      unsubs.push(() => ro.disconnect());
      loop.noteInteraction();
      statusRef.current({ canvas: 'ready', ticker: loop.running });
    })();
    return () => {
      disposed = true;
      unsubs.forEach((u) => u());
      loopRef.current?.destroy();
      loopRef.current = null;
      view?.destroy();
    };
    // Le moteur est créé une fois par montage ; les changements passent par les stores.
  }, [stores]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loopRef.current?.setReducedMotion(reducedMotion); }, [reducedMotion]);

  return <div ref={host} className={styles.canvasHost} />;
}
