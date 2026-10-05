import { Container, Graphics, Rectangle, Sprite, Texture, TilingSprite } from 'pixi.js';
import { rowStrips } from '@/features/scene/rows.pure';
import type { SceneSnapshot } from '@/features/scene/snapshot.schema';
import { greenhousePieces, GREENHOUSE_SLICES, seasonal, zonePieces, type Season } from '@/features/scene/tiles.pure';
import { ZONE_FRAMES } from '../manifest';
import type { RenderCtx } from './atlas';
import { FURROW, OUTLINE, ZONE_COLORS } from './palette';

/*
 * Zones de la scène (SPEC §9.2) : planches et carrés en pièces (bois, saisons, neige), serres de face (MAP-13), sillons
 * des rangs (FIL-07), les autres types en motif répété. Les structures de serre sont rendues à part, pour le fondu
 * d'entrée (MAP-14).
 */

type Rect = { x: number; y: number; w: number; h: number };

export function createZoneRenderer(ctx: RenderCtx) {
  /** Tranches (toit, bande vitrée, mur) des pièces de serre, par frame, découpées une fois. */
  const slices = new Map<string, [Texture, Texture, Texture]>();

  /** Frame de fond d'une zone, dans sa variante saisonnière si elle existe (`tuiles/terre-1` → `tuiles/terre-hiver-1`). */
  function zoneFrame(typeCode: string, season: Season): string | undefined {
    const base = ZONE_FRAMES[typeCode];
    const m = base ? /^(.+?)-(\d)\.png$/.exec(base) : null;
    return (m?.[1] && m[2] ? seasonal(ctx.has, m[1], season, m[2]) : null) ?? base;
  }

  function sliceOf(frame: string): [Texture, Texture, Texture] | null {
    const cached = slices.get(frame);
    if (cached) return cached;
    const t = ctx.tex(frame);
    if (!t) return null;
    const f = t.frame;
    const top = Math.round(f.height * GREENHOUSE_SLICES.top);
    const bottom = Math.round(f.height * GREENHOUSE_SLICES.bottom);
    const part = (from: number, to: number) => new Texture({ source: t.source, frame: new Rectangle(f.x, f.y + from, f.width, to - from) });
    const out: [Texture, Texture, Texture] = [part(0, top), part(top, bottom), part(bottom, f.height)];
    slices.set(frame, out);
    return out;
  }

  /**
   * Pièce de serre étirée sur une colonne de la zone : toit en haut, mur et porte en bas à leur taille, la bande vitrée
   * répétée entre les deux. Une zone trop basse reçoit la pièce entière, tassée.
   */
  function drawSliced(into: Container, frame: string, r: Rect) {
    const t = ctx.tex(frame);
    const parts = sliceOf(frame);
    if (!t || !parts) return;
    const k = r.w / t.frame.width;
    const [top, mid, bottom] = parts;
    const topH = top.frame.height * k;
    const bottomH = bottom.frame.height * k;
    if (r.h < topH + bottomH) {
      into.addChild(Object.assign(new Sprite(t), { x: r.x, y: r.y, width: r.w, height: r.h }));
      return;
    }
    into.addChild(Object.assign(new Sprite(top), { x: r.x, y: r.y, width: r.w, height: topH }));
    const midH = r.h - topH - bottomH;
    if (midH > 0) {
      const band = new TilingSprite({ texture: mid, width: r.w, height: midH });
      band.tileScale.set(k, k);
      into.addChild(Object.assign(band, { x: r.x, y: r.y + topH }));
    }
    into.addChild(Object.assign(new Sprite(bottom), { x: r.x, y: r.y + r.h - bottomH, width: r.w, height: bottomH }));
  }

  /** Serre (MAP-13) : son sol, puis sa structure de face, rangée dans `structures` pour le fondu d'entrée. */
  function drawGreenhouse(layer: Container, structures: Map<string, Container>, id: string, r: Rect, cols: number, season: Season): boolean {
    const pieces = greenhousePieces(cols, season, ctx.has);
    if (!pieces) return false;
    const floor = ctx.tex('tuiles/sol-serre-carrelage-1.png');
    if (floor) layer.addChild(Object.assign(new TilingSprite({ texture: floor, width: r.w, height: r.h }), { x: r.x, y: r.y }));
    const node = new Container();
    const pw = r.w / cols;
    pieces.forEach((p, i) => {
      const col = { x: r.x + i * pw, y: r.y, w: pw, h: r.h };
      drawSliced(node, p.frame, col);
      if (p.snow) drawSliced(node, p.snow, col);
    });
    layer.addChild(node);
    structures.set(id, node);
    return true;
  }

  /** Rang (FIL-07) : un sillon le long de sa bande, sur la terre de la planche. */
  function drawFurrow(layer: Container, r: Rect) {
    const horizontal = r.w >= r.h;
    const across = horizontal ? r.h : r.w;
    const groove = Math.max(2, Math.min(6, across * 0.2));
    const ridge = Math.max(1, groove / 2);
    const mid = (horizontal ? r.y : r.x) + across / 2;
    const g = new Graphics();
    if (horizontal) {
      g.rect(r.x + 2, mid - groove / 2 - ridge, r.w - 4, ridge).fill({ color: FURROW.ridge, alpha: FURROW.ridgeAlpha });
      g.rect(r.x + 2, mid - groove / 2, r.w - 4, groove).fill({ color: FURROW.groove, alpha: FURROW.grooveAlpha });
    } else {
      g.rect(mid - groove / 2 - ridge, r.y + 2, ridge, r.h - 4).fill({ color: FURROW.ridge, alpha: FURROW.ridgeAlpha });
      g.rect(mid - groove / 2, r.y + 2, groove, r.h - 4).fill({ color: FURROW.groove, alpha: FURROW.grooveAlpha });
    }
    layer.addChild(g);
  }

  /** Dessine toutes les zones de la scène dans `layer` ; renvoie les structures de serre, par zone. */
  function draw(s: SceneSnapshot, layer: Container): Map<string, Container> {
    const { px, tex, atlas } = ctx;
    const structures = new Map<string, Container>();
    const season = s.ambient.season;
    const strips = rowStrips(s.zones, s.tileSizeCm);
    for (const z of [...s.zones].sort((a, b) => a.depth - b.depth)) {
      const strip = strips.get(z.id);
      if (strip) {
        drawFurrow(layer, { x: px(strip.x), y: px(strip.y), w: px(strip.w), h: px(strip.h) });
        continue;
      }
      if (!z.geometry) continue;
      const { x, y, w, h } = z.geometry;
      const cols = Math.max(1, Math.round(w / s.tileSizeCm));
      const rows = Math.max(1, Math.round(h / s.tileSizeCm));
      if (z.typeCode === 'greenhouse' && atlas && drawGreenhouse(layer, structures, z.id, { x: px(x), y: px(y), w: px(w), h: px(h) }, cols, season)) continue;
      const pieces = atlas ? zonePieces(z.typeCode, cols, rows, season, ctx.has) : null;
      if (pieces) {
        const pw = px(w) / cols;
        const ph = px(h) / rows;
        for (const p of pieces) {
          for (const frame of [p.frame, p.snow]) {
            const t = tex(frame);
            if (t) layer.addChild(Object.assign(new Sprite(t), { x: px(x) + p.x * pw, y: px(y) + p.y * ph, width: pw, height: ph }));
          }
        }
        continue;
      }
      const t = tex(zoneFrame(z.typeCode, season));
      if (t) layer.addChild(Object.assign(new TilingSprite({ texture: t, width: px(w), height: px(h) }), { x: px(x), y: px(y) }));
      const g = new Graphics().rect(px(x), px(y), px(w), px(h));
      if (!t) g.fill({ color: ZONE_COLORS[z.typeCode] ?? 0xb08a60, alpha: z.depth === 0 ? 0.55 : 0.9 });
      g.stroke({ width: 2, color: OUTLINE, alpha: 0.6 });
      layer.addChild(g);
    }
    return structures;
  }

  return { draw };
}
