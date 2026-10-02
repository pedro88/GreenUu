import { createStore } from 'zustand/vanilla';
import { applyAll, type EditorScene, type ZoneTypeInfo } from '@/features/scene/plan.pure';
import type { PlanCommand } from '@/features/scene/plan.schema';
import type { SceneSnapshot } from '@/features/scene/snapshot.schema';

/*
 * Stores du moteur (SPEC §9.1). Ce sont des stores Zustand « vanilla » : le moteur s'y abonne avec `subscribe` et lit
 * `getState()`, React n'est jamais sur le chemin de rendu. Une instance par scène affichée.
 */

export const UNDO_LEVELS = 50;

export type Selection = { kind: 'zone' | 'culture'; id: string } | null;
export type Tool = 'select' | 'zone' | 'terrain' | 'eraser';

export function createSceneStore(snapshot: SceneSnapshot) {
  return createStore<{ snapshot: SceneSnapshot; setSnapshot: (s: SceneSnapshot) => void }>()((set) => ({ snapshot, setSnapshot: (s) => set({ snapshot: s }) }));
}

export function createCameraStore() {
  return createStore<{ x: number; y: number; zoom: number; pan: (dx: number, dy: number) => void; zoomBy: (f: number) => void; reset: () => void }>()((set) => ({
    x: 0, y: 0, zoom: 1,
    pan: (dx, dy) => set((s) => ({ x: s.x + dx, y: s.y + dy })),
    // Zoom par paliers entiers ou demi-entiers : le pixel art reste net (`nearest`, §9.1).
    zoomBy: (f) => set((s) => ({ zoom: Math.min(4, Math.max(0.5, Math.round(s.zoom * f * 2) / 2)) })),
    reset: () => set({ x: 0, y: 0, zoom: 1 }),
  }));
}

export function createSelectionStore() {
  return createStore<{ selected: Selection; select: (s: Selection) => void }>()((set) => ({ selected: null, select: (selected) => set({ selected }) }));
}

export function createToolStore() {
  return createStore<{ tool: Tool; zoneTypeId: string | null; terrainKind: string; setTool: (t: Tool) => void; setZoneType: (id: string) => void; setTerrainKind: (k: string) => void }>()((set) => ({
    tool: 'select', zoneTypeId: null, terrainKind: 'path',
    setTool: (tool) => set({ tool }), setZoneType: (zoneTypeId) => set({ zoneTypeId }), setTerrainKind: (terrainKind) => set({ terrainKind }),
  }));
}

type HistoryState = {
  /** Dernier état confirmé par le serveur. */
  base: EditorScene;
  baseVersion: number;
  /** Commandes appliquées localement et pas encore confirmées, dans l'ordre. */
  done: PlanCommand[];
  undone: PlanCommand[];
  /** État affiché : `base` + `done`. */
  current: EditorScene;
  push: (cmd: PlanCommand) => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  /** Après un enregistrement réussi ou un rechargement : nouvelle base, historique repris de zéro. */
  reset: (base: EditorScene, baseVersion: number, pending?: PlanCommand[]) => void;
};

/** Annuler / rétablir de l'éditeur (§9.7, PLN-05), sur les 50 derniers gestes non enregistrés. */
export function createHistoryStore(base: EditorScene, baseVersion: number, types: Map<string, ZoneTypeInfo>) {
  return createStore<HistoryState>()((set, get) => ({
    base, baseVersion, done: [], undone: [], current: base,
    push: (cmd) => set((s) => {
      const done = [...s.done, cmd];
      return { done, undone: [], current: applyAll(s.base, done, types) };
    }),
    canUndo: () => get().done.length > 0 && get().undone.length < UNDO_LEVELS,
    undo: () => {
      if (!get().canUndo()) return;
      set((s) => {
        const done = s.done.slice(0, -1);
        return { done, undone: [s.done[s.done.length - 1] as PlanCommand, ...s.undone], current: applyAll(s.base, done, types) }; // as: done non vide (canUndo)
      });
    },
    redo: () => set((s) => {
      const [next, ...rest] = s.undone;
      if (!next) return s;
      const done = [...s.done, next];
      return { done, undone: rest, current: applyAll(s.base, done, types) };
    }),
    reset: (b, v, pending = []) => set({ base: b, baseVersion: v, done: pending, undone: [], current: applyAll(b, pending, types) }),
  }));
}

export type HistoryStore = ReturnType<typeof createHistoryStore>;
