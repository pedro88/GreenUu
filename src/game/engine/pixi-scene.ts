// Synchronisation des shaders précompilée : la CSP de production interdit `eval` / `new Function` (audit lot 7, M1).
import 'pixi.js/unsafe-eval';
import { Application, Assets, Container, Graphics, Rectangle, Sprite, Texture, TextureStyle, TilingSprite } from 'pixi.js';
import { avatarCanvas, WALK } from '@/features/avatar/compose';
import { decorFrame } from '@/features/decor/catalog';
import type { SceneAvatar, SceneCulture, SceneDecor, SceneSnapshot } from '@/features/scene/snapshot.schema';
import { MAX_VISIBLE_STATES, type VisualPhase } from '@/features/scene/phase.pure';
import { TILE_PX } from '@/features/scene/grid.pure';
import { fetchAtlas, grassFrame, resolvePlantFrame, STATE_FRAMES, TERRAIN_FRAMES, ZONE_FRAMES, type PhaseIndex } from '../manifest';

/*
 * Rendu PixiJS de la scène (SPEC §9.1, §9.2). Seul ce module (et `GardenCanvas`) importe PixiJS. Il lit les stores et ne
 * décide de rien : l'état vient de l'instantané. Sans atlas, chaque élément est dessiné par un asset de substitution
 * (formes colorées), pour que la vue reste utilisable et testable.
 */

TextureStyle.defaultOptions.scaleMode = 'nearest';

/**
 * Vide un calque en détruisant ses objets (géométries GPU comprises) : `removeChildren()` seul les détache sans les
 * libérer, et la scène est reconstruite à chaque instantané et à chaque geste de l'éditeur (audit lot 7, M2). Les
 * textures de l'atlas sont partagées : on ne les détruit pas.
 */
function clearLayer(layer: Container) {
  for (const child of layer.removeChildren()) child.destroy({ children: true, texture: false, textureSource: false });
}

type Atlas = { index: PhaseIndex; textures: Map<string, Texture> } | null;

/**
 * Atlas multi-pages (sprites HD) : une source par page, à la résolution des assets ; les cadres sont exprimés en unités
 * logiques (pixels / résolution), comme le fait le parseur de spritesheets de PixiJS.
 */
async function loadAtlas(): Promise<Atlas> {
  const atlas = await fetchAtlas();
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
    const textures = new Map<string, Texture>();
    for (const [name, f] of atlas.frames) {
      const src = sources.get(f.page);
      if (src) textures.set(name, new Texture({ source: src.source, frame: new Rectangle(f.x / r, f.y / r, f.w / r, f.h / r) }));
    }
    return { index: atlas.index, textures };
  } catch {
    return null;
  }
}

/** Couleurs des assets de substitution (palette des maquettes). */
const ZONE_COLORS: Record<string, number> = {
  bed: 0x8b5a3c, row: 0x9a6a48, square_bed: 0x7a4e33, container: 0x7a4e33, pot: 0xb4683f, greenhouse: 0xcfe3e8, tunnel: 0xdfeae0, bench: 0xa77b52,
  nursery: 0xc9a979, seed_tray: 0x6b4a33, cell: 0x6b4a33, compost: 0x5b4636, orchard: 0x7fae5a, fruit_hedge: 0x5f8f43, flower_bed: 0xd9b05b,
  meadow: 0x8fbf63, path: 0xc8b48c, plot: 0xb08a60,
};
const TERRAIN_COLORS: Record<string, number> = {
  path: 0xc6a879, gravel_path: 0xb9b2a4, stepping_stones: 0xa9a39a, water_point: 0x4f8fc0, rain_barrel: 0x5a7da0, hedge: 0x3f6b35,
  existing_tree: 0x3c6e2f, fence: 0x7a5a3a, gate: 0x7a5a3a,
};
const PHASE_SIZE: Record<VisualPhase, number> = { seed: 6, sprout: 10, growing: 16, flowering: 20, fruiting: 22, harvest_ready: 24, seed_set: 20, dormant: 12, finished: 10 };
const PHASE_COLOR: Record<VisualPhase, number> = {
  seed: 0x8b5a3c, sprout: 0x9fcf6a, growing: 0x6f9a4f, flowering: 0xe58fb5, fruiting: 0xd4573b, harvest_ready: 0xf2c14e, seed_set: 0xb08a60, dormant: 0x8a7a6a, finished: 0x9a8f80,
};
const STATE_COLORS: Record<string, number> = { overdue_ticket: 0xd4573b, thirsty: 0x4f8fc0, disease: 0x8a5fa8, pest: 0x7a8a2a, harvest_ready: 0xf2c14e, needs_confirmation: 0xffffff, assigned_to_me: 0x2e1f22 };

export type SceneView = {
  /** Reconstruit la scène depuis un instantané (après revalidation ou geste de l'éditeur). */
  setSnapshot: (s: SceneSnapshot) => void;
  setCamera: (c: { x: number; y: number; zoom: number }) => void;
  setSelection: (id: string | null) => void;
  setDraft: (r: { x: number; y: number; w: number; h: number } | null) => void;
  setGrid: (on: boolean) => void;
  /** Avance les animations ambiantes (ondulation des plantes). */
  animate: (elapsedMs: number) => void;
  render: () => void;
  destroy: () => void;
};

export async function createSceneView(host: HTMLElement, opts: { onMissingSprite?: (key: string) => void; onChange?: () => void } = {}): Promise<SceneView> {
  const onAvatarReady = opts.onChange;
  const app = new Application();
  await app.init({ resizeTo: host, backgroundAlpha: 0, antialias: false, autoStart: false, preference: 'webgl', resolution: window.devicePixelRatio || 1, autoDensity: true });
  app.ticker.stop();
  app.canvas.setAttribute('aria-hidden', 'true');
  host.appendChild(app.canvas);
  const atlas = await loadAtlas();

  const world = new Container();
  const ground = new Container();
  const terrainLayer = new Container();
  const zoneLayer = new Container();
  const plantLayer = new Container({ sortableChildren: true });
  const bubbleLayer = new Container();
  const overlay = new Graphics();
  const grid = new Graphics();
  const selection = new Graphics();
  const draft = new Graphics();
  const tint = new Graphics();
  world.addChild(ground, terrainLayer, zoneLayer, grid, plantLayer, bubbleLayer, selection, draft);
  app.stage.addChild(world, overlay, tint);

  let snapshot: SceneSnapshot | null = null;
  let scale = 1;
  let gridOn = false;
  let elapsed = 0;
  const plants: Sprite[] = [];
  /** Avatars posés : frames de marche composées en Canvas 2D (§10.2), animées seulement par la boucle ambiante. */
  const walkers: { sprite: Sprite; frames: Texture[]; baseX: number; phase: number }[] = [];
  const avatarTextures = new Map<string, Promise<Texture[]>>();
  let generation = 0;
  const tex = (name: string | null | undefined) => (name ? atlas?.textures.get(name) : undefined);

  const px = (cm: number) => cm * scale;

  function drawGround(s: SceneSnapshot) {
    clearLayer(ground);
    const w = px(s.bounds.w);
    const h = px(s.bounds.h);
    const grass = s.sceneZoneId ? tex('tuiles/sol-serre-carrelage-1.png') : tex(grassFrame(s.ambient.season, 1));
    if (grass) {
      ground.addChild(new TilingSprite({ texture: grass, width: w, height: h }));
    } else {
      ground.addChild(new Graphics().rect(0, 0, w, h).fill(s.sceneZoneId ? 0xe9e4da : 0x9cc56b));
    }
  }

  function drawZones(s: SceneSnapshot) {
    clearLayer(zoneLayer);
    for (const z of [...s.zones].sort((a, b) => a.depth - b.depth)) {
      if (!z.geometry) continue;
      const { x, y, w, h } = z.geometry;
      const t = tex(ZONE_FRAMES[z.typeCode]);
      if (t) zoneLayer.addChild(Object.assign(new TilingSprite({ texture: t, width: px(w), height: px(h) }), { x: px(x), y: px(y) }));
      const g = new Graphics().rect(px(x), px(y), px(w), px(h));
      if (!t) g.fill({ color: ZONE_COLORS[z.typeCode] ?? 0xb08a60, alpha: z.depth === 0 ? 0.55 : 0.9 });
      g.stroke({ width: 2, color: 0x2e222f, alpha: 0.6 });
      zoneLayer.addChild(g);
    }
  }

  function drawTerrain(s: SceneSnapshot) {
    clearLayer(terrainLayer);
    for (const t of s.terrain) {
      const { x, y, w, h } = t.geometry;
      const frame = tex(TERRAIN_FRAMES[t.kind]);
      if (frame) terrainLayer.addChild(Object.assign(new TilingSprite({ texture: frame, width: px(w), height: px(h) }), { x: px(x), y: px(y) }));
      else terrainLayer.addChild(new Graphics().rect(px(x), px(y), px(w), px(h)).fill(TERRAIN_COLORS[t.kind] ?? 0xc6a879));
    }
  }

  function plantSprite(c: SceneCulture): Sprite | Graphics {
    const r = atlas ? resolvePlantFrame(atlas.index, c.spriteKeys, c.phase, opts.onMissingSprite) : null;
    const t = tex(r?.frame);
    if (t) {
      const sp = new Sprite(t);
      sp.anchor.set(0.5, 1);
      return sp;
    }
    // Substitution : une tige et un feuillage dont la taille suit la phase.
    const size = PHASE_SIZE[c.phase];
    return new Graphics().rect(-1, -size, 2, size).fill(0x4f6f35).circle(0, -size, size / 2).fill(PHASE_COLOR[c.phase]).stroke({ width: 1, color: 0x2e222f });
  }

  function drawPlants(s: SceneSnapshot) {
    clearLayer(plantLayer);
    clearLayer(bubbleLayer);
    plants.length = 0;
    for (const c of s.cultures) {
      if (!c.position) continue;
      const node = plantSprite(c);
      node.position.set(px(c.position.x), px(c.position.y));
      // Tri de profondeur par le bas des sprites (§9.1).
      node.zIndex = c.position.y;
      plantLayer.addChild(node);
      if (node instanceof Sprite) plants.push(node);
      c.states.slice(0, MAX_VISIBLE_STATES).forEach((state, i) => {
        const bt = tex(STATE_FRAMES[state]);
        const bx = px(c.position?.x ?? 0) + (i - (Math.min(c.states.length, MAX_VISIBLE_STATES) - 1) / 2) * 18;
        const by = px(c.position?.y ?? 0) - 40;
        if (bt) bubbleLayer.addChild(Object.assign(new Sprite(bt), { x: bx - 8, y: by - 8 }));
        else bubbleLayer.addChild(new Graphics().circle(bx, by, 7).fill(STATE_COLORS[state] ?? 0xffffff).stroke({ width: 1, color: 0x2e222f }));
      });
    }
  }

  function decorNode(d: SceneDecor): Sprite | Graphics {
    const t = tex(decorFrame(d.spriteKey));
    if (t) {
      const sp = new Sprite(t);
      sp.anchor.set(0.5, 1);
      return sp;
    }
    // Substitution : un bloc de la taille de l'emprise.
    const w = d.w * TILE_PX;
    const h = d.h * TILE_PX * 0.75;
    return new Graphics().rect(-w / 2 + 2, -h, w - 4, h).fill(0xa77b52).stroke({ width: 2, color: 0x2e222f });
  }

  function drawDecor(s: SceneSnapshot) {
    for (const d of s.decor) {
      const node = decorNode(d);
      node.position.set(px(d.x), px(d.y));
      node.zIndex = d.y;
      plantLayer.addChild(node);
    }
  }

  /** Textures d'un avatar (arrêt puis marche), en cache par `configHash`, à la résolution des sprites HD. */
  function avatarFrames(a: SceneAvatar): Promise<Texture[]> {
    let p = avatarTextures.get(a.configHash);
    if (!p) {
      p = Promise.all((['arret', ...WALK] as const).map((pose) => avatarCanvas(a.config, 'bas', pose))).then((canvases) => canvases.flatMap((c) => {
        if (!c) return [];
        const t = Texture.from(c);
        t.source.resolution = 2;
        t.source.scaleMode = 'nearest';
        return [t];
      }));
      avatarTextures.set(a.configHash, p);
    }
    return p;
  }

  function drawAvatars(s: SceneSnapshot) {
    walkers.length = 0;
    const gen = generation;
    for (const [i, a] of s.avatars.entries()) {
      void avatarFrames(a).then((frames) => {
        const first = frames[0];
        if (gen !== generation || !first) return;
        const sp = new Sprite(first);
        sp.anchor.set(0.5, 1);
        sp.position.set(px(a.position.x), px(a.position.y));
        sp.zIndex = a.position.y + 1;
        plantLayer.addChild(sp);
        walkers.push({ sprite: sp, frames, baseX: sp.x, phase: i * 1.7 });
        onAvatarReady?.();
      });
    }
  }

  function drawGrid(s: SceneSnapshot) {
    grid.clear();
    if (!gridOn) return;
    const step = TILE_PX;
    const w = px(s.bounds.w);
    const h = px(s.bounds.h);
    for (let x = 0; x <= w; x += step) grid.moveTo(x, 0).lineTo(x, h);
    for (let y = 0; y <= h; y += step) grid.moveTo(0, y).lineTo(w, y);
    grid.stroke({ width: 1, color: 0x2e222f, alpha: 0.35 });
  }

  function drawTint(s: SceneSnapshot) {
    tint.clear();
    // Filtre jour / nuit et saison : un voile de couleur sur toute la scène (§9.1).
    if (s.ambient.alpha > 0) tint.rect(0, 0, app.screen.width, app.screen.height).fill({ color: s.ambient.tint, alpha: s.ambient.alpha });
  }

  return {
    setSnapshot(s) {
      snapshot = s;
      scale = TILE_PX / s.tileSizeCm;
      drawGround(s);
      drawTerrain(s);
      drawZones(s);
      drawGrid(s);
      drawPlants(s);
      drawDecor(s);
      generation += 1;
      drawAvatars(s);
      drawTint(s);
    },
    setCamera(c) {
      world.position.set(c.x, c.y);
      world.scale.set(c.zoom);
      if (snapshot) drawTint(snapshot);
    },
    setSelection(id) {
      selection.clear();
      if (!snapshot || !id) return;
      const z = snapshot.zones.find((x) => x.id === id);
      const c = snapshot.cultures.find((x) => x.id === id);
      if (z?.geometry) selection.rect(px(z.geometry.x), px(z.geometry.y), px(z.geometry.w), px(z.geometry.h)).stroke({ width: 3, color: 0xf2c14e });
      else if (c?.position) selection.circle(px(c.position.x), px(c.position.y) - 12, 18).stroke({ width: 3, color: 0xf2c14e });
    },
    setDraft(r) {
      draft.clear();
      if (r) draft.rect(px(r.x), px(r.y), px(r.w), px(r.h)).fill({ color: 0xf2c14e, alpha: 0.35 }).stroke({ width: 2, color: 0x2e1f22 });
    },
    setGrid(on) {
      gridOn = on;
      if (snapshot) drawGrid(snapshot);
    },
    animate(ms) {
      elapsed += ms;
      // Ondulation légère, seulement quand la boucle ambiante tourne (jamais en animations réduites).
      plants.forEach((p, i) => { p.skew.x = Math.sin(elapsed / 700 + i) * 0.04; });
      // Marche lente d'un côté à l'autre, au pied de la zone (§9.5) ; statique en animations réduites.
      for (const w of walkers) {
        const t = elapsed / 1000 + w.phase;
        w.sprite.x = w.baseX + Math.sin(t / 3) * 12;
        const f = w.frames[1 + (Math.floor(elapsed / 220) % Math.max(1, w.frames.length - 1))];
        if (f) w.sprite.texture = f;
      }
    },
    render() {
      app.render();
    },
    destroy() {
      app.destroy({ removeView: true }, { children: true });
    },
  };
}
