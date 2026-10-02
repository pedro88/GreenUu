'use client';

import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { TILE_PX } from '@/features/scene/grid.pure';
import type { SceneSnapshot } from '@/features/scene/snapshot.schema';
import type { GameStores } from './stores';
import styles from './GardenView.module.scss';

/*
 * Fenêtre de la scène, partagée par la vue jardin et l'éditeur de plan : caméra (glisser, molette, pincer), et couche
 * « monde » du DOM synchronisée avec la caméra, qui porte la couche accessible (§9.6).
 */

export const pxPerCm = (s: SceneSnapshot) => TILE_PX / s.tileSizeCm;

/** Palier de zoom : quarts sous 1, demis au-dessus (le pixel art reste net, §9.1). */
export function snapZoom(z: number) {
  const step = z < 1 ? 4 : 2;
  return Math.min(4, Math.max(0.25, Math.floor(z * step) / step));
}

/** Caméra qui fait tenir la scène dans la fenêtre, centrée. */
export function fitCamera(s: SceneSnapshot, width: number, height = Number.POSITIVE_INFINITY) {
  const worldW = s.bounds.w * pxPerCm(s);
  const worldH = s.bounds.h * pxPerCm(s);
  const zoom = Math.min(2, snapZoom(Math.min((width - 16) / worldW, (height - 16) / worldH)));
  return { x: Math.max(8, Math.round((width - worldW * zoom) / 2)), y: Math.max(8, Math.round((height === Number.POSITIVE_INFINITY ? 16 : height - worldH * zoom) / 2)), zoom };
}

const DRAG_THRESHOLD = 6;

/**
 * Glisser pour déplacer, molette ou pincer pour zoomer. Un glisser au-delà de 6 px annule le clic qui suit, pour qu'un
 * déplacement de la carte n'ouvre pas la feuille de l'élément sous le doigt.
 */
export function useViewportGestures(ref: RefObject<HTMLElement | null>, stores: GameStores, opts: { enabled: () => boolean }) {
  const enabled = useRef(opts.enabled);
  useEffect(() => { enabled.current = opts.enabled; });
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const pointers = new Map<number, { x: number; y: number }>();
    let moved = 0;
    let pinch = 0;
    const down = (e: PointerEvent) => {
      if (!enabled.current()) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      moved = 0;
    };
    const move = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId);
      if (!prev || !enabled.current()) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
        if (pinch && d) stores.camera.getState().zoomBy(d / pinch);
        pinch = d;
        return;
      }
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      moved += Math.abs(dx) + Math.abs(dy);
      if (moved > DRAG_THRESHOLD) stores.camera.getState().pan(dx, dy);
    };
    const up = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = 0;
    };
    const click = (e: MouseEvent) => {
      if (moved > DRAG_THRESHOLD) { e.stopPropagation(); e.preventDefault(); moved = 0; }
    };
    const wheel = (e: WheelEvent) => {
      if (!enabled.current()) return;
      e.preventDefault();
      stores.camera.getState().zoomBy(e.deltaY < 0 ? 1.25 : 0.8);
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('click', click, true);
    el.addEventListener('wheel', wheel, { passive: false });
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('click', click, true);
      el.removeEventListener('wheel', wheel);
    };
  }, [ref, stores]);
}

/** Couche « monde » : translatée et mise à l'échelle comme le canvas, sans rerendu React à chaque mouvement. */
export function WorldLayer({ stores, children, label }: { stores: GameStores; children: ReactNode; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const apply = (c: { x: number; y: number; zoom: number }) => {
      if (ref.current) ref.current.style.transform = `translate(${c.x}px, ${c.y}px) scale(${c.zoom})`;
    };
    apply(stores.camera.getState());
    return stores.camera.subscribe(apply);
  }, [stores]);
  return <div ref={ref} className={styles.world} role="group" aria-label={label}>{children}</div>;
}
