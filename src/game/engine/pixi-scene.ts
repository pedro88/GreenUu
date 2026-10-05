// Synchronisation des shaders précompilée : la CSP de production interdit `eval` / `new Function` (audit lot 7, M1).
import 'pixi.js/unsafe-eval';
import { Application, Container, Graphics, TextureStyle } from 'pixi.js';
import { TILE_PX } from '@/features/scene/grid.pure';
import { withRowGeometry } from '@/features/scene/rows.pure';
import type { SceneSnapshot } from '@/features/scene/snapshot.schema';
import type { Season } from '@/features/scene/tiles.pure';
import { OPENING_MS } from '../stores';
import { seasonAtlasUrl } from '../manifest';
import { clearLayer, loadAtlas, type RenderCtx } from './atlas';
import { createAvatarLayer } from './avatars';
import { buildGround, buildTerrain } from './ground';
import { HIGHLIGHT, OUTLINE } from './palette';
import { drawDecor, drawPlants } from './plants';
import { createZoneRenderer } from './zones';

/*
 * Rendu PixiJS de la scène (SPEC §9.1, §9.2) : ce module assemble les calques et décide quoi redessiner ; le dessin de
 * chaque calque vit dans son module (fond et terrain, zones, plants et objets, avatars). Seuls ces modules (et
 * `GardenCanvas`) importent PixiJS. Ils lisent l'instantané et ne décident de rien. Sans atlas, chaque élément est
 * dessiné par un asset de substitution (formes colorées), pour que la vue reste utilisable et testable.
 */

TextureStyle.defaultOptions.scaleMode = 'nearest';

export type SceneView = {
  /** Reconstruit la scène depuis un instantané (après revalidation ou geste de l'éditeur). */
  setSnapshot: (s: SceneSnapshot) => void;
  setCamera: (c: { x: number; y: number; zoom: number }) => void;
  setSelection: (id: string | null) => void;
  setDraft: (r: { x: number; y: number; w: number; h: number } | null) => void;
  setGrid: (on: boolean) => void;
  /** Entrée dans une zone à intérieur (serre) : sa structure s'efface en fondu et laisse voir son sol. */
  setOpening: (zoneId: string | null) => void;
  /** Avance les animations ambiantes (avatars). */
  animate: (elapsedMs: number) => void;
  render: () => void;
  destroy: () => void;
};

/** Ce que la scène a dessiné, exposé à la couche DOM (`data-season`, `data-terrain-*`) pour les tests et le débogage. */
export type SceneStats = { season: Season | null; terrainTiles: number; terrainTransitions: number };

export async function createSceneView(host: HTMLElement, opts: { onMissingSprite?: (key: string) => void; onChange?: () => void; onStats?: (s: SceneStats) => void } = {}): Promise<SceneView> {
  const app = new Application();
  await app.init({ resizeTo: host, backgroundAlpha: 0, antialias: false, autoStart: false, preference: 'webgl', resolution: window.devicePixelRatio || 1, autoDensity: true });
  app.ticker.stop();
  app.canvas.setAttribute('aria-hidden', 'true');
  host.appendChild(app.canvas);
  const atlas = await loadAtlas();
  /** Saison dont l'atlas est chargé (l'été n'en a pas : c'est la base). */
  let loadedSeason: Season | null = 'summer';
  let seasonLoading: Season | null = null;
  let scale = 1;
  const ctx: RenderCtx = {
    atlas,
    tex: (name) => (name ? atlas?.textures.get(name) : undefined),
    has: (frame) => atlas?.textures.has(frame) ?? false,
    px: (cm) => cm * scale,
    onMissingSprite: opts.onMissingSprite,
  };

  const world = new Container();
  const ground = new Container();
  const terrainLayer = new Container();
  const zoneLayer = new Container();
  /** Plants, objets et avatars, triés par le bas des sprites (§9.1). */
  const objectLayer = new Container({ sortableChildren: true });
  const bubbleLayer = new Container();
  const grid = new Graphics();
  const selection = new Graphics();
  const draft = new Graphics();
  world.addChild(ground, terrainLayer, zoneLayer, grid, objectLayer, bubbleLayer, selection, draft);
  app.stage.addChild(world);

  const zones = createZoneRenderer(ctx);
  const avatars = createAvatarLayer(ctx, objectLayer, opts.onChange);
  let snapshot: SceneSnapshot | null = null;
  /** Structures dessinées par zone (serres), pour le fondu d'entrée (MAP-14). */
  let structures = new Map<string, Container>();
  let opening: { id: string; at: number } | null = null;
  let gridOn = false;
  let elapsed = 0;
  /** Fond déjà dessiné pour cette saison, cette emprise et cette scène : rien à refaire. */
  let groundKey = '';

  /**
   * Atlas de la saison courante (TER-01) : chargé une fois, seulement s'il n'est pas déjà là ; l'été est la base. La
   * scène est redessinée quand il arrive, sans attendre : en attendant, les clés de base servent de repli (TER-03).
   */
  function ensureSeason(season: Season) {
    if (!atlas || season === 'summer' || loadedSeason === season || seasonLoading === season) return;
    seasonLoading = season;
    void loadAtlas(seasonAtlasUrl(season), atlas.textures).then(() => {
      if (seasonLoading !== season) return;
      loadedSeason = season;
      seasonLoading = null;
      // Nouvelles textures : tout est redessiné, même instantané compris.
      const current = snapshot;
      snapshot = null;
      if (current) redraw(current);
      opts.onChange?.();
    });
  }

  function drawGround(s: SceneSnapshot) {
    const key = `${s.sceneZoneId ?? ''}|${s.ambient.season}|${s.bounds.w}x${s.bounds.h}|${s.tileSizeCm}|${atlas ? loadedSeason : 'none'}`;
    if (key === groundKey) return;
    groundKey = key;
    clearLayer(ground);
    ground.addChild(buildGround(s, ctx));
  }

  function drawTerrain(s: SceneSnapshot) {
    clearLayer(terrainLayer);
    const t = buildTerrain(s, ctx);
    terrainLayer.addChild(t.node);
    opts.onStats?.({ season: !atlas || loadedSeason === s.ambient.season ? s.ambient.season : null, terrainTiles: t.tiles, terrainTransitions: t.transitions });
  }

  function drawGrid(s: SceneSnapshot) {
    grid.clear();
    if (!gridOn) return;
    const w = ctx.px(s.bounds.w);
    const h = ctx.px(s.bounds.h);
    for (let x = 0; x <= w; x += TILE_PX) grid.moveTo(x, 0).lineTo(x, h);
    for (let y = 0; y <= h; y += TILE_PX) grid.moveTo(0, y).lineTo(w, y);
    grid.stroke({ width: 1, color: OUTLINE, alpha: 0.35 });
  }

  function redraw(s: SceneSnapshot) {
    const prev = snapshot;
    // Seules les cases ont changé (aperçu du pinceau, gomme) : on ne redessine que le terrain, et le fond si l'emprise
    // de la scène a bougé (audit jardin vivant, M3). Les autres calques gardent leurs sprites.
    if (prev && prev.zones === s.zones && prev.decor === s.decor && prev.cultures === s.cultures && prev.avatars === s.avatars && prev.tileSizeCm === s.tileSizeCm
      && prev.sceneZoneId === s.sceneZoneId && prev.ambient.season === s.ambient.season) {
      snapshot = s;
      if (prev.bounds.w !== s.bounds.w || prev.bounds.h !== s.bounds.h) {
        drawGround(s);
        drawGrid(s);
      }
      if (prev.terrain !== s.terrain) drawTerrain(s);
      return;
    }
    snapshot = s;
    scale = TILE_PX / s.tileSizeCm;
    ensureSeason(s.ambient.season);
    drawGround(s);
    drawTerrain(s);
    clearLayer(zoneLayer);
    structures = zones.draw(s, zoneLayer);
    drawGrid(s);
    clearLayer(objectLayer);
    clearLayer(bubbleLayer);
    drawPlants(s, ctx, objectLayer, bubbleLayer);
    drawDecor(s, ctx, objectLayer);
    avatars.draw(s);
  }

  return {
    setSnapshot(s) {
      redraw(s);
    },
    setCamera(c) {
      world.position.set(c.x, c.y);
      world.scale.set(c.zoom);
    },
    setSelection(id) {
      selection.clear();
      if (!snapshot || !id) return;
      const { px } = ctx;
      const z = withRowGeometry(snapshot.zones, snapshot.tileSizeCm).find((x) => x.id === id);
      const c = snapshot.cultures.find((x) => x.id === id);
      if (z?.geometry) selection.rect(px(z.geometry.x), px(z.geometry.y), px(z.geometry.w), px(z.geometry.h)).stroke({ width: 3, color: HIGHLIGHT });
      else if (c?.footprint) selection.rect(px(c.footprint.x), px(c.footprint.y), px(c.footprint.w), px(c.footprint.h)).stroke({ width: 3, color: HIGHLIGHT });
      else if (c?.position) selection.circle(px(c.position.x), px(c.position.y) - 12, 18).stroke({ width: 3, color: HIGHLIGHT });
    },
    setDraft(r) {
      draft.clear();
      if (r) draft.rect(ctx.px(r.x), ctx.px(r.y), ctx.px(r.w), ctx.px(r.h)).fill({ color: HIGHLIGHT, alpha: 0.35 }).stroke({ width: 2, color: 0x2e1f22 });
    },
    setOpening(id) {
      if ((opening?.id ?? null) === id) return;
      opening = id ? { id, at: performance.now() } : null;
      if (!id) for (const n of structures.values()) n.alpha = 1;
    },
    setGrid(on) {
      gridOn = on;
      if (snapshot) drawGrid(snapshot);
    },
    animate(ms) {
      elapsed += ms;
      avatars.animate(ms, elapsed);
    },
    render() {
      if (opening) {
        const node = structures.get(opening.id);
        if (node) node.alpha = Math.max(0, 1 - (performance.now() - opening.at) / OPENING_MS);
      }
      app.render();
    },
    destroy() {
      app.destroy({ removeView: true }, { children: true });
    },
  };
}
