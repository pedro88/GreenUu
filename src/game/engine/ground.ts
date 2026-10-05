import { Container, Graphics, Sprite, TilingSprite } from 'pixi.js';
import { TILE_PX } from '@/features/scene/grid.pure';
import type { SceneSnapshot } from '@/features/scene/snapshot.schema';
import { linearLayer, SURFACE_ORDER, surfaceLayer, variantAt, type TileDraw } from '@/features/scene/tiles.pure';
import { grassFrame } from '../manifest';
import { BLOCK_TILES, type RenderCtx } from './atlas';
import { GRASS_COLORS, GRASS_TEXTURE_ALPHA, INDOOR_FLOOR, TERRAIN_COLORS } from './palette';

/*
 * Fond et terrain de la scène (SPEC §9.1, §9.2), précalculés par blocs de 16 × 16 tuiles : une texture par bloc, au lieu
 * d'un sprite par tuile rendu à chaque image de la boucle d'animation (audit lot 10, M2 ; audit de suivi, performance).
 */

/** Regroupe des tuiles par bloc et met chaque bloc en cache de texture. */
function cachedBlocks(draws: { x: number; y: number; frame: string }[], ctx: RenderCtx): { node: Container; drawn: number } {
  const blocks = new Map<string, Container>();
  let drawn = 0;
  for (const d of draws) {
    const t = ctx.tex(d.frame);
    if (!t) continue;
    const key = `${Math.floor(d.x / BLOCK_TILES)},${Math.floor(d.y / BLOCK_TILES)}`;
    let block = blocks.get(key);
    if (!block) {
      block = new Container();
      blocks.set(key, block);
    }
    block.addChild(Object.assign(new Sprite(t), { x: d.x * TILE_PX, y: d.y * TILE_PX, width: TILE_PX, height: TILE_PX }));
    drawn += 1;
  }
  const node = new Container();
  for (const block of blocks.values()) {
    block.cacheAsTexture(true);
    node.addChild(block);
  }
  return { node, drawn };
}

/**
 * Dedans (serre), le carrelage. Dehors, l'herbe : une teinte de fond par saison, puis les 3 variantes de tuile d'herbe
 * alternées case par case (tirage fixe par position) et atténuées (demande de l'utilisateur du 2026-10-05).
 */
export function buildGround(s: SceneSnapshot, ctx: RenderCtx): Container {
  const node = new Container();
  const w = ctx.px(s.bounds.w);
  const h = ctx.px(s.bounds.h);
  const floor = s.sceneZoneId ? ctx.tex('tuiles/sol-serre-carrelage-1.png') : undefined;
  if (floor) {
    node.addChild(new TilingSprite({ texture: floor, width: w, height: h }));
    return node;
  }
  node.addChild(new Graphics().rect(0, 0, w, h).fill(s.sceneZoneId ? INDOOR_FLOOR : GRASS_COLORS[s.ambient.season]));
  if (s.sceneZoneId || !ctx.atlas) return node;
  const draws: { x: number; y: number; frame: string }[] = [];
  for (let y = 0; y < Math.ceil(h / TILE_PX); y += 1) {
    for (let x = 0; x < Math.ceil(w / TILE_PX); x += 1) draws.push({ x, y, frame: grassFrame(s.ambient.season, variantAt(x, y, 3) as 1 | 2 | 3) }); // as: variantAt(…, 3) ∈ {1, 2, 3}
  }
  const grass = cachedBlocks(draws, ctx).node;
  grass.alpha = GRASS_TEXTURE_ALPHA;
  node.addChild(grass);
  return node;
}

/**
 * Terrain peint (§9.2) : une couche dual-grid par surface, dans l'ordre fixe, puis haies et clôtures raccordées. Une
 * case vaut une tuile (`TILE_PX`) quelle que soit l'échelle. Renvoie aussi ce qui a été dessiné, pour la couche DOM.
 */
export function buildTerrain(s: SceneSnapshot, ctx: RenderCtx): { node: Container; tiles: number; transitions: number } {
  if (!ctx.atlas) {
    const g = new Graphics();
    for (const c of s.terrain) g.rect(c.x * TILE_PX, c.y * TILE_PX, TILE_PX, TILE_PX).fill(TERRAIN_COLORS[c.kind] ?? 0xc6a879);
    const node = new Container();
    node.addChild(g);
    return { node, tiles: s.terrain.length, transitions: 0 };
  }
  // Une suite de blocs par couche, dans l'ordre fixe des couches (surfaces, puis linéaires) : à la frontière de deux
  // blocs, une couche du dessous ne recouvre jamais une couche du dessus.
  const layers: TileDraw[][] = [...SURFACE_ORDER.map((kind) => surfaceLayer(s.terrain, kind, s.ambient.season, ctx.has)), linearLayer(s.terrain, s.ambient.season, ctx.has)];
  const node = new Container();
  let tiles = 0;
  for (const draws of layers) {
    if (!draws.length) continue;
    const layer = cachedBlocks(draws, ctx);
    node.addChild(layer.node);
    tiles += layer.drawn;
  }
  const transitions = layers.flat().filter((d) => d.frame.startsWith('transitions/') && ctx.has(d.frame)).length;
  return { node, tiles, transitions };
}
