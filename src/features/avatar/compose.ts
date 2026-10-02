'use client';

import { AVATAR_LAYERS } from '@/lib/enums';
import { fetchAtlas, type LoadedAtlas } from '@/game/manifest';
import { AVATAR_ITEM_BY_CODE, PALETTE_BY_CODE } from './catalog';
import type { AvatarConfigV1 } from './config.pure';
import { recolorPixels } from './recolor.pure';

/*
 * Composition de l'avatar en Canvas 2D (SPEC §10.2, §10.5), sans PixiJS : calques recolorés dans l'ordre fixe, frames
 * HD de l'atlas (`avatar/<clé>-<direction>-<pose>.png`). Les vignettes n'utilisent que la frame de face à l'arrêt,
 * servie en fichier individuel (`/sprites/avatar/<clé>-bas-arret.png`) : elles ne chargent jamais l'atlas complet.
 * Les calques recolorés sont en cache mémoire par (source, élément, palettes, direction, pose) ; les vignettes, en
 * mémoire et dans Cache Storage sous `avatar:<configHash>`.
 */

export const DIRECTIONS = ['bas', 'gauche', 'haut', 'droite'] as const;
export type Direction = (typeof DIRECTIONS)[number];
export type Pose = 'arret' | 'marche-f1' | 'marche-f2' | 'marche-f3' | 'marche-f4';
export const WALK: readonly Pose[] = ['marche-f1', 'marche-f2', 'marche-f3', 'marche-f4'];

/** Taille d'un sprite d'avatar HD et cadre « tête et buste » de la vignette (§10.5). */
export const SPRITE = { w: 64, h: 96 };
const BUST = { x: 0, y: 4, size: 64 };
export const THUMB_PX = 64;

let atlasP: Promise<LoadedAtlas | null> | null = null;
const images = new Map<string, Promise<HTMLImageElement | null>>();
const layers = new Map<string, Promise<HTMLCanvasElement | null>>();
const thumbs = new Map<string, Promise<string | null>>();

const atlas = () => (atlasP ??= fetchAtlas());

function image(url: string) {
  let p = images.get(url);
  if (!p) {
    p = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = url;
    });
    images.set(url, p);
  }
  return p;
}

const canvas = (w: number, h: number) => Object.assign(document.createElement('canvas'), { width: w, height: h });

/** Source des frames : l'atlas complet (éditeur, vue jardin) ou les frames de face individuelles (vignettes). */
type Source = 'atlas' | 'single';
type Frame = { img: HTMLImageElement; x: number; y: number; w: number; h: number };

async function frameOf(spriteKey: string, dir: Direction, pose: Pose, source: Source): Promise<Frame | null> {
  if (source === 'single') {
    const img = await image(`/sprites/avatar/${spriteKey}-bas-arret.png`);
    return img ? { img, x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight } : null;
  }
  const a = await atlas();
  const f = a ? a.frames.get(`avatar/${spriteKey}-${dir}-${pose}.png`) ?? a.frames.get(`avatar/${spriteKey}-${dir}-arret.png`) : undefined;
  const img = f ? await image(f.page) : null;
  return f && img ? { img, x: f.x, y: f.y, w: f.w, h: f.h } : null;
}

/** Un calque recoloré (§10.2), ou null si la frame manque (repli sans erreur, §9.2). */
function layer(item: string, palettes: string[], dir: Direction, pose: Pose, source: Source = 'atlas'): Promise<HTMLCanvasElement | null> {
  const key = `${source}|${item}|${palettes.join(',')}|${dir}|${pose}`;
  let p = layers.get(key);
  if (!p) {
    p = (async () => {
      const def = AVATAR_ITEM_BY_CODE.get(item);
      const f = def ? await frameOf(def.spriteKey, dir, pose, source) : null;
      if (!f) return null;
      const img = f.img;
      const c = canvas(f.w, f.h);
      const ctx = c.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;
      ctx.drawImage(img, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
      const ramps = palettes.map((code) => PALETTE_BY_CODE.get(code)?.ramp ?? null);
      if (ramps.some(Boolean)) {
        const data = ctx.getImageData(0, 0, f.w, f.h);
        recolorPixels(data.data, ramps);
        ctx.putImageData(data, 0, 0);
      }
      return c;
    })();
    layers.set(key, p);
  }
  return p;
}

/** Dessine l'avatar complet dans `target` (taille du sprite), calques de l'arrière vers l'avant (§10.1). */
export async function drawAvatar(target: CanvasRenderingContext2D, config: AvatarConfigV1, dir: Direction = 'bas', pose: Pose = 'arret', source: Source = 'atlas'): Promise<boolean> {
  const parts = await Promise.all(AVATAR_LAYERS.map((l) => {
    const e = config.layers[l];
    return e?.item ? layer(e.item, e.palettes, dir, pose, source) : Promise.resolve(null);
  }));
  target.clearRect(0, 0, target.canvas.width, target.canvas.height);
  target.imageSmoothingEnabled = false;
  const sx = target.canvas.width / SPRITE.w;
  const sy = target.canvas.height / SPRITE.h;
  let drawn = false;
  for (const p of parts) {
    if (!p) continue;
    target.drawImage(p, 0, 0, p.width * sx, p.height * sy);
    drawn = true;
  }
  return drawn;
}

/** Sprite composé hors écran, à la taille native (pour la vue jardin). */
export async function avatarCanvas(config: AvatarConfigV1, dir: Direction = 'bas', pose: Pose = 'arret', source: Source = 'atlas'): Promise<HTMLCanvasElement | null> {
  const c = canvas(SPRITE.w, SPRITE.h);
  const ctx = c.getContext('2d');
  return ctx && (await drawAvatar(ctx, config, dir, pose, source)) ? c : null;
}

const CACHE = 'greenu-avatars';

/**
 * Vignette tête et buste (64 × 64), composée une fois par `configHash` (§10.5) : mémoire, puis Cache Storage. Toute
 * modification change le hash, donc la clé : pas d'invalidation à gérer. Null sans atlas (repli : initiale).
 */
export function avatarThumbnail(config: AvatarConfigV1, configHash: string): Promise<string | null> {
  let p = thumbs.get(configHash);
  if (!p) {
    p = (async () => {
      const key = `/avatar-cache/${configHash}`;
      const store = typeof caches !== 'undefined' ? await caches.open(CACHE).catch(() => null) : null;
      const hit = await store?.match(key);
      if (hit) return URL.createObjectURL(await hit.blob());
      const full = await avatarCanvas(config, 'bas', 'arret', 'single');
      if (!full) return null;
      const c = canvas(THUMB_PX, THUMB_PX);
      const ctx = c.getContext('2d');
      if (!ctx) return null;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(full, BUST.x, BUST.y, BUST.size, BUST.size, 0, 0, THUMB_PX, THUMB_PX);
      const blob = await new Promise<Blob | null>((resolve) => c.toBlob(resolve, 'image/png'));
      if (!blob) return c.toDataURL();
      await store?.put(key, new Response(blob, { headers: { 'content-type': 'image/png', 'x-avatar-key': `avatar:${configHash}` } })).catch(() => undefined);
      return URL.createObjectURL(blob);
    })();
    thumbs.set(configHash, p);
  }
  return p;
}
