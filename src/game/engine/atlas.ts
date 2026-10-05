import { Assets, type Container, Rectangle, Texture } from 'pixi.js';
import { fetchAtlas, type PhaseIndex } from '../manifest';

/*
 * Atlas de la scène côté PixiJS (SPEC §9.2) et contexte de rendu partagé par les modules du moteur. Les textures d'un
 * atlas de saison s'ajoutent à celles de la scène, dans la même table.
 */

export type LoadedTextures = { index: PhaseIndex; textures: Map<string, Texture> };

/** Ce dont les modules de rendu ont besoin : les textures, et la conversion centimètres → pixels de la scène. */
export type RenderCtx = {
  atlas: LoadedTextures | null;
  tex: (name: string | null | undefined) => Texture | undefined;
  has: (frame: string) => boolean;
  px: (cm: number) => number;
  onMissingSprite?: ((key: string) => void) | undefined;
};

/**
 * Atlas multi-pages (sprites HD) : une source par page, à la résolution des assets ; les cadres sont exprimés en unités
 * logiques (pixels / résolution), comme le fait le parseur de spritesheets de PixiJS. `into` reçoit les textures (un
 * atlas de saison s'ajoute à celui de la scène).
 */
export async function loadAtlas(url?: string, into = new Map<string, Texture>()): Promise<LoadedTextures | null> {
  const atlas = await fetchAtlas(url);
  if (!atlas) return null;
  try {
    // Planches chargées sur le thread principal, pas dans les workers de PixiJS : ces requêtes sont alors visibles de
    // la page, qui les confie au service worker, et la vue jardin s'affiche hors-ligne (OFF-01).
    Assets.setPreferences({ preferWorkers: false });
    // Pages chargées en parallèle, pas l'une après l'autre.
    const loaded = await Promise.all(atlas.pages.map((page) => Assets.load<Texture>(page)));
    const sources = new Map<string, Texture>();
    atlas.pages.forEach((page, k) => {
      const t = loaded[k];
      if (!t) return;
      t.source.resolution = atlas.resolution;
      sources.set(page, t);
    });
    const r = atlas.resolution;
    for (const [name, f] of atlas.frames) {
      const src = sources.get(f.page);
      if (src) into.set(name, new Texture({ source: src.source, frame: new Rectangle(f.x / r, f.y / r, f.w / r, f.h / r) }));
    }
    return { index: atlas.index, textures: into };
  } catch {
    return null;
  }
}

/**
 * Vide un calque en détruisant ses objets (géométries GPU comprises) : `removeChildren()` seul les détache sans les
 * libérer, et la scène est reconstruite à chaque instantané et à chaque geste de l'éditeur (audit lot 7, M2). Les
 * textures de l'atlas sont partagées : on ne les détruit pas.
 */
export function clearLayer(layer: Container) {
  for (const child of layer.removeChildren()) child.destroy({ children: true, texture: false, textureSource: false });
}

/** Côté d'un bloc précalculé (fond, terrain), en tuiles (§9.1). */
export const BLOCK_TILES = 16;
