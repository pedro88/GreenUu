'use client';

import { AVATAR_SPRITES } from '@/generated/avatar-sprites';
import { AVATAR_LAYERS, SKIN_LINKED_LAYERS, type AvatarLayer } from '@/lib/enums';
import { actionAtlasUrl, AVATAR_ATLAS_URL, fetchAtlas, type LoadedAtlas } from '@/game/manifest';
import { AVATAR_ITEM_BY_CODE, BASE_GABARIT, PALETTE_BY_CODE } from './catalog';
import { frameCandidates, gabaritsSchema, headOffset, type GabaritTable } from './frames.pure';
import type { AvatarConfigV1 } from './config.pure';
import { recolorPixels } from './recolor.pure';

/*
 * Composition de l'avatar en Canvas 2D (SPEC §10.2, §10.5), sans PixiJS : calques recolorés dans l'ordre fixe, frames
 * HD de l'atlas (`avatar/<clé>-<direction>-<pose>.png`). Les vignettes n'utilisent que la frame de face à l'arrêt,
 * servie en fichier individuel (`/sprites/avatar/<clé>-bas-arret.png`) : elles ne chargent jamais l'atlas complet.
 * Les calques recolorés sont en cache mémoire par (source, élément, rampes, gabarit, direction, pose) ; les vignettes,
 * en mémoire et dans Cache Storage sous `avatar:<configHash>`.
 */

export const DIRECTIONS = ['bas', 'gauche', 'haut', 'droite'] as const;
export type Direction = (typeof DIRECTIONS)[number];
/** Pose : à l'arrêt, une image de marche, ou une image d'action (`arroser-f2`, atlas d'action chargé à la demande). */
export type Pose = 'arret' | 'marche-f1' | 'marche-f2' | 'marche-f3' | 'marche-f4' | `${string}-f${number}`;
export const WALK: readonly Pose[] = ['marche-f1', 'marche-f2', 'marche-f3', 'marche-f4'];

/** Taille d'un sprite d'avatar HD et cadre « tête et buste » de la vignette (§10.5). */
export const SPRITE = { w: 64, h: 96 };
const BUST = { x: 0, y: 4, size: 64 };
export const THUMB_PX = 64;

let atlasP: Promise<LoadedAtlas | null> | null = null;
const images = new Map<string, Promise<HTMLImageElement | null>>();
const layers = new Map<string, Promise<HTMLCanvasElement | null>>();
const thumbs = new Map<string, Promise<string | null>>();

const atlas = () => (atlasP ??= fetchAtlas(AVATAR_ATLAS_URL));
const actionAtlases = new Map<string, Promise<LoadedAtlas | null>>();
/** Atlas d'une action (`avatar-action-<action>.json`), téléchargé seulement quand un avatar la joue (§9.2, LIV-01). */
function actionAtlas(action: string) {
  let p = actionAtlases.get(action);
  if (!p) {
    p = fetchAtlas(actionAtlasUrl(action));
    actionAtlases.set(action, p);
  }
  return p;
}

/**
 * Couleur de l'objet manipulé pendant une action (calque `outil`, en niveaux de gris), comme `sprites_hd/avatars_demo.py` :
 * métal, paille, osier… Rampe de la plus claire à la plus sombre.
 */
const METAL = ['#c4c8c2', '#969c9a', '#6e7476', '#464a4e'] as const;
const OSIER = ['#e2ba7c', '#c49256', '#9c6a3a', '#6e4624'] as const;
const GRIS = ['#c4c8c6', '#929698', '#64686c', '#3c3e42'] as const;
const TOOL_RAMPS: Record<string, readonly string[]> = {
  arroser: METAL, becher: METAL, semer: ['#f4d48a', '#e4b662', '#c2904a', '#966634'], planter: ['#92c078', '#609650', '#3c6e3a', '#244628'],
  recolter: OSIER, porter: OSIER, observer: GRIS, photo: GRIS,
};

/** Nombre d'images d'une action, d'après son atlas (1 si l'atlas manque). */
export async function actionFrameCount(action: string): Promise<number> {
  const a = await actionAtlas(action);
  if (!a) return 0;
  let n = 0;
  const re = new RegExp(`-bas-${action}-f(\\d+)\\.png$`);
  for (const k of a.frames.keys()) n = Math.max(n, Number(re.exec(k)?.[1] ?? 0));
  return n;
}

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

const SKIN_LINKED: ReadonlySet<AvatarLayer> = new Set(SKIN_LINKED_LAYERS);

let gabaritsP: Promise<GabaritTable | null> | null = null;
/** Décalages de tête par gabarit (`gabarits.json`, livré avec les sprites) ; absents tant qu'il n'y a qu'un gabarit. */
const gabarits = () => (gabaritsP ??= fetch('/sprites/avatar/gabarits.json').then(async (r) => (r.ok ? gabaritsSchema.safeParse(await r.json()).data ?? null : null)).catch(() => null));

async function frameOf(names: string[], source: Source, action: string | null = null): Promise<Frame | null> {
  if (source === 'single') {
    // Fichiers individuels : seulement la frame de face à l'arrêt (`avatar/<clé>-bas-arret.png`).
    for (const n of names.filter((x) => x.endsWith('-bas-arret.png'))) {
      const img = await image(`/sprites/${n}`);
      if (img) return { img, x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight };
    }
    return null;
  }
  // Pendant une action : l'atlas de l'action d'abord, puis celui de l'avatar (repli sur la pose à l'arrêt).
  const [act, base] = await Promise.all([action ? actionAtlas(action) : null, atlas()]);
  const f = names.map((n) => act?.frames.get(n) ?? base?.frames.get(n)).find(Boolean);
  const img = f ? await image(f.page) : null;
  return f && img ? { img, x: f.x, y: f.y, w: f.w, h: f.h } : null;
}

/** Un calque recoloré (§10.2), ou null si la frame manque (repli sans erreur, §9.2). */
function layer(o: { layer: AvatarLayer | 'tool' | 'effect'; item: string; ramps: (readonly string[] | null)[]; gabarit: string; dir: Direction; pose: Pose; source: Source; action?: string | null }): Promise<HTMLCanvasElement | null> {
  const key = `${o.source}|${o.layer}|${o.item}|${o.ramps.map((r) => r?.join('') ?? '-').join(',')}|${o.gabarit}|${o.dir}|${o.pose}`;
  let p = layers.get(key);
  if (!p) {
    p = (async () => {
      const f = await frameOf(layerFrames(o), o.source, o.action ?? null);
      if (!f) return null;
      const c = canvas(f.w, f.h);
      const ctx = c.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;
      ctx.drawImage(f.img, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
      if (o.ramps.some(Boolean)) {
        const data = ctx.getImageData(0, 0, f.w, f.h);
        recolorPixels(data.data, o.ramps);
        ctx.putImageData(data, 0, 0);
      }
      return c;
    })();
    layers.set(key, p);
  }
  return p;
}

/** Frames à essayer pour un calque ; l'outil et l'effet d'une action ont leur propre nom (`outil-<action>[@gabarit]-<dir>-f<n>`). */
function layerFrames(o: { layer: AvatarLayer | 'tool' | 'effect'; item: string; gabarit: string; dir: Direction; pose: Pose }): string[] {
  if (o.layer === 'tool' || o.layer === 'effect') {
    const n = o.pose.slice(o.pose.lastIndexOf('-f') + 1);
    const key = `${o.layer === 'tool' ? 'outil' : 'effet'}-${o.item}`;
    return [...(o.gabarit === BASE_GABARIT ? [] : [`avatar/${key}@${o.gabarit}-${o.dir}-${n}.png`]), `avatar/${key}-${o.dir}-${n}.png`];
  }
  const def = AVATAR_ITEM_BY_CODE.get(o.item);
  return def ? frameCandidates({ layer: o.layer, spriteKey: def.spriteKey, gabarit: o.gabarit, dir: o.dir, pose: o.pose, available: AVATAR_SPRITES }) : [];
}

/**
 * Dessine l'avatar complet dans `target` (taille du sprite), calques de l'arrière vers l'avant (§10.1). Le gabarit du
 * corps choisit les variantes des vêtements et décale les calques de tête ; la peau du corps recolore la tête.
 */
export async function drawAvatar(target: CanvasRenderingContext2D, config: AvatarConfigV1, dir: Direction = 'bas', pose: Pose = 'arret', source: Source = 'atlas', action: string | null = null): Promise<boolean> {
  const body = config.layers.body?.item ? AVATAR_ITEM_BY_CODE.get(config.layers.body.item) : undefined;
  const gabarit = body?.gabarit ?? BASE_GABARIT;
  const skin = config.layers.body?.palettes[0];
  const skinRamp = skin ? PALETTE_BY_CODE.get(skin)?.ramp ?? null : null;
  const table = gabarit === BASE_GABARIT ? null : await gabarits();
  const parts = await Promise.all(AVATAR_LAYERS.map(async (l) => {
    const e = config.layers[l];
    // Pendant une action, l'objet tenu est masqué au profit de l'outil de l'action (§9.5).
    if (!e?.item || (action && l === 'held_item')) return null;
    const linked = SKIN_LINKED.has(l);
    const ramps = linked ? [skinRamp] : e.palettes.map((code) => PALETTE_BY_CODE.get(code)?.ramp ?? null);
    const c = await layer({ layer: l, item: e.item, ramps, gabarit, dir, pose, source, action });
    return c ? { c, offset: headOffset(table, l, gabarit, dir, pose) } : null;
  }));
  if (action) {
    // Puis l'outil (recoloré) et l'effet de l'action, variantes de gabarit comprises.
    for (const l of ['tool', 'effect'] as const) {
      const c = await layer({ layer: l, item: action, ramps: l === 'tool' ? [TOOL_RAMPS[action] ?? null] : [], gabarit, dir, pose, source, action });
      parts.push(c ? { c, offset: [0, 0] } : null);
    }
  }
  target.clearRect(0, 0, target.canvas.width, target.canvas.height);
  target.imageSmoothingEnabled = false;
  const sx = target.canvas.width / SPRITE.w;
  const sy = target.canvas.height / SPRITE.h;
  let drawn = false;
  for (const p of parts) {
    if (!p) continue;
    target.drawImage(p.c, p.offset[0] * sx, p.offset[1] * sy, p.c.width * sx, p.c.height * sy);
    drawn = true;
  }
  return drawn;
}

/** Sprite composé hors écran, à la taille native (pour la vue jardin). */
export async function avatarCanvas(config: AvatarConfigV1, dir: Direction = 'bas', pose: Pose = 'arret', source: Source = 'atlas', action: string | null = null): Promise<HTMLCanvasElement | null> {
  const c = canvas(SPRITE.w, SPRITE.h);
  const ctx = c.getContext('2d');
  return ctx && (await drawAvatar(ctx, config, dir, pose, source, action)) ? c : null;
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
