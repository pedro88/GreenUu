import { type Container, Graphics, Sprite } from 'pixi.js';
import { decorFrame } from '@/features/decor/catalog';
import { plantSpots } from '@/features/scene/fill.pure';
import { MAX_VISIBLE_STATES } from '@/features/scene/phase.pure';
import { TILE_PX } from '@/features/scene/grid.pure';
import type { SceneCulture, SceneDecor, SceneSnapshot } from '@/features/scene/snapshot.schema';
import { existingTreeFrame, type Season } from '@/features/scene/tiles.pure';
import { resolvePlantFrame, STATE_FRAMES } from '../manifest';
import type { RenderCtx } from './atlas';
import { OUTLINE, PHASE_COLOR, PHASE_SIZE, STATE_COLORS } from './palette';

/*
 * Plants, bulles d'état et objets posés (SPEC §9.2 à §9.4) : triés par le bas des sprites dans le calque des objets,
 * avec les avatars. Les plants ne bougent pas (décision de l'utilisateur du 2026-10-05).
 */

/** Sprite d'un plant ; `alt` choisit la variante `-b` de la frame quand elle existe (casse l'effet clone, FIL-04). */
function plantSprite(c: SceneCulture, alt: boolean, ctx: RenderCtx): Sprite | Graphics {
  const r = ctx.atlas ? resolvePlantFrame(ctx.atlas.index, c.spriteKeys, c.phase, ctx.onMissingSprite) : null;
  const variant = r?.frame && alt ? r.frame.replace(/\.png$/, '-b.png') : null;
  const t = ctx.tex(variant && ctx.has(variant) ? variant : r?.frame);
  if (t) {
    const sp = new Sprite(t);
    sp.anchor.set(0.5, 1);
    return sp;
  }
  // Substitution : une tige et un feuillage dont la taille suit la phase.
  const size = PHASE_SIZE[c.phase];
  return new Graphics().rect(-1, -size, 2, size).fill(0x4f6f35).circle(0, -size, size / 2).fill(PHASE_COLOR[c.phase]).stroke({ width: 1, color: OUTLINE });
}

/** Cultures (FIL-01 à 06) : leurs plants en rangs dans leur bande ; les bulles d'état au-dessus du centre de la culture. */
export function drawPlants(s: SceneSnapshot, ctx: RenderCtx, plants: Container, bubbles: Container) {
  const { px } = ctx;
  for (const c of s.cultures) {
    if (!c.position) continue;
    const spots = c.footprint ? plantSpots(c.id, c.footprint, c.plants.drawn, s.tileSizeCm) : [{ ...c.position, mirror: false, alt: false }];
    for (const spot of spots) {
      const node = plantSprite(c, spot.alt, ctx);
      node.position.set(px(spot.x), px(spot.y));
      if (spot.mirror) node.scale.x = -1;
      // Tri de profondeur par le bas des sprites (§9.1).
      node.zIndex = spot.y;
      plants.addChild(node);
    }
    const top = Math.min(...spots.map((p) => p.y));
    c.states.slice(0, MAX_VISIBLE_STATES).forEach((state, i) => {
      const bt = ctx.tex(STATE_FRAMES[state]);
      const bx = px(c.position?.x ?? 0) + (i - (Math.min(c.states.length, MAX_VISIBLE_STATES) - 1) / 2) * 18;
      const by = px(top) - 40;
      if (bt) bubbles.addChild(Object.assign(new Sprite(bt), { x: bx - 8, y: by - 8 }));
      else bubbles.addChild(new Graphics().circle(bx, by, 7).fill(STATE_COLORS[state] ?? 0xffffff).stroke({ width: 1, color: OUTLINE }));
    });
  }
}

function decorNode(d: SceneDecor, season: Season, ctx: RenderCtx): Sprite | Graphics {
  // L'arbre existant suit les saisons (étapes du pommier, TER-05).
  const t = ctx.tex(d.itemCode === 'existing_tree' ? existingTreeFrame(season, ctx.has) : decorFrame(d.spriteKey));
  if (t) {
    const sp = new Sprite(t);
    sp.anchor.set(0.5, 1);
    return sp;
  }
  // Substitution : un bloc de la taille de l'emprise.
  const w = d.w * TILE_PX;
  const h = d.h * TILE_PX * 0.75;
  return new Graphics().rect(-w / 2 + 2, -h, w - 4, h).fill(0xa77b52).stroke({ width: 2, color: OUTLINE });
}

/** Objets posés (déco et aménagements ponctuels), triés avec les plants. */
export function drawDecor(s: SceneSnapshot, ctx: RenderCtx, layer: Container) {
  for (const d of s.decor) {
    const node = decorNode(d, s.ambient.season, ctx);
    node.position.set(ctx.px(d.x), ctx.px(d.y));
    node.zIndex = d.y;
    layer.addChild(node);
  }
}
