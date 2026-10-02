import { createStore } from 'zustand/vanilla';
import type { AvatarLayer } from '@/lib/enums';
import { normalizeConfig, randomAvatar, type AvatarConfigV1 } from '../config.pure';
import { DIRECTIONS, type Direction } from '../compose';

/*
 * État d'édition de l'avatar (SPEC §10.4) : store Zustand « vanilla », lu par la boucle d'animation de l'aperçu
 * (`getState`) sans passer par React. `saved` est la dernière version enregistrée, `draft` la version affichée.
 */

export type AvatarEditorState = {
  saved: AvatarConfigV1;
  savedHash: string;
  draft: AvatarConfigV1;
  dir: Direction;
  setItem: (layer: AvatarLayer, item: string | null, palettes: string[]) => void;
  setPalette: (layer: AvatarLayer, slot: number, code: string) => void;
  randomize: (isUnlocked: (code: string) => boolean) => void;
  /** « Annuler » : retour à la dernière version enregistrée (AVT-07). */
  revert: () => void;
  commit: (config: AvatarConfigV1, hash: string) => void;
  turn: (step: 1 | -1) => void;
  dirty: () => boolean;
};

const same = (a: AvatarConfigV1, b: AvatarConfigV1) => JSON.stringify(normalizeConfig(a)) === JSON.stringify(normalizeConfig(b));

export function createAvatarEditorStore(saved: AvatarConfigV1, savedHash: string) {
  return createStore<AvatarEditorState>()((set, get) => ({
    saved, savedHash, draft: normalizeConfig(saved), dir: 'bas',
    setItem: (layer, item, palettes) => set((s) => ({ draft: { v: 1, layers: { ...s.draft.layers, [layer]: { item, palettes: item ? palettes : [] } } } })),
    setPalette: (layer, slot, code) => set((s) => {
      const e = s.draft.layers[layer];
      if (!e?.item) return s;
      const palettes = [...e.palettes];
      palettes[slot] = code;
      return { draft: { v: 1, layers: { ...s.draft.layers, [layer]: { ...e, palettes } } } };
    }),
    randomize: (isUnlocked) => set({ draft: normalizeConfig(randomAvatar(isUnlocked)) }),
    revert: () => set((s) => ({ draft: normalizeConfig(s.saved) })),
    commit: (config, hash) => set({ saved: config, savedHash: hash, draft: normalizeConfig(config) }),
    turn: (step) => set((s) => ({ dir: DIRECTIONS[(DIRECTIONS.indexOf(s.dir) + step + DIRECTIONS.length) % DIRECTIONS.length] ?? 'bas' })),
    dirty: () => !same(get().draft, get().saved),
  }));
}

export type AvatarEditorStore = ReturnType<typeof createAvatarEditorStore>;
