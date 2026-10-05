// Synchronisation des shaders précompilée : la CSP de production interdit `eval` / `new Function` (audit lot 7, M1).
import 'pixi.js/unsafe-eval';
import { Application, Assets, Container, Graphics, Rectangle, Sprite, Texture, TextureStyle, TilingSprite } from 'pixi.js';
import { actionFrameCount, avatarCanvas, WALK, type Pose } from '@/features/avatar/compose';
import { decorFrame } from '@/features/decor/catalog';
import { plantSpots } from '@/features/scene/fill.pure';
import { avatarPlan, CHAT_MS, chatPairs, chatPicto, planMoment, walkDir, type Segment, type WalkDir } from '@/features/scene/avatar-route.pure';
import { findPath, walkGrid } from '@/features/scene/path.pure';
import { existingTreeFrame, linearLayer, seasonal, variantAt, SURFACE_ORDER, surfaceLayer, zonePieces, type Season, type TileDraw } from '@/features/scene/tiles.pure';
import type { SceneAvatar, SceneCulture, SceneDecor, SceneSnapshot } from '@/features/scene/snapshot.schema';
import { MAX_VISIBLE_STATES, type VisualPhase } from '@/features/scene/phase.pure';
import { TILE_PX } from '@/features/scene/grid.pure';
import { fetchAtlas, grassFrame, resolvePlantFrame, seasonAtlasUrl, STATE_FRAMES, ZONE_FRAMES, type PhaseIndex } from '../manifest';

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
 * logiques (pixels / résolution), comme le fait le parseur de spritesheets de PixiJS. `into` reçoit les textures (un
 * atlas de saison s'ajoute à celui de la scène).
 */
async function loadAtlas(url?: string, into = new Map<string, Texture>()): Promise<Atlas> {
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

/** Fond d'herbe uni de la scène extérieure, par saison (tons relevés sur les tuiles d'herbe livrées, adoucis). */
const GRASS_COLORS: Record<Season, number> = { spring: 0x8fbb5c, summer: 0x86b257, autumn: 0x9caa58, winter: 0xb9c7ae };
/** Opacité des tuiles d'herbe sur la teinte de fond : la texture reste visible, le contraste baisse. */
const GRASS_TEXTURE_ALPHA = 0.5;

/** Couleurs des assets de substitution (palette des maquettes). */
const ZONE_COLORS: Record<string, number> = {
  bed: 0x8b5a3c, row: 0x9a6a48, square_bed: 0x7a4e33, container: 0x7a4e33, pot: 0xb4683f, greenhouse: 0xcfe3e8, tunnel: 0xdfeae0, bench: 0xa77b52,
  nursery: 0xc9a979, seed_tray: 0x6b4a33, cell: 0x6b4a33, compost: 0x5b4636, orchard: 0x7fae5a, fruit_hedge: 0x5f8f43, flower_bed: 0xd9b05b,
  meadow: 0x8fbf63, path: 0xc8b48c, plot: 0xb08a60,
};
const TERRAIN_COLORS: Record<string, number> = {
  path: 0xc6a879, gravel_path: 0xb9b2a4, stepping_stones: 0xa9a39a, water: 0x4f8fc0, bare_soil: 0x9a6a48, mulch: 0xd9b05b, hedge: 0x3f6b35, fence: 0x7a5a3a,
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

/** Ce que la scène a dessiné, exposé à la couche DOM (`data-season`, `data-terrain-*`) pour les tests et le débogage. */
export type SceneStats = { season: Season | null; terrainTiles: number; terrainTransitions: number };

export async function createSceneView(host: HTMLElement, opts: { onMissingSprite?: (key: string) => void; onChange?: () => void; onStats?: (s: SceneStats) => void } = {}): Promise<SceneView> {
  const onAvatarReady = opts.onChange;
  const app = new Application();
  await app.init({ resizeTo: host, backgroundAlpha: 0, antialias: false, autoStart: false, preference: 'webgl', resolution: window.devicePixelRatio || 1, autoDensity: true });
  app.ticker.stop();
  app.canvas.setAttribute('aria-hidden', 'true');
  host.appendChild(app.canvas);
  const atlas = await loadAtlas();
  /** Saison dont l'atlas est chargé (l'été n'en a pas : c'est la base). */
  let loadedSeason: Season | null = 'summer';
  let seasonLoading: Season | null = null;
  const has = (frame: string) => atlas?.textures.has(frame) ?? false;

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
  world.addChild(ground, terrainLayer, zoneLayer, grid, plantLayer, bubbleLayer, selection, draft);
  app.stage.addChild(world, overlay);

  let snapshot: SceneSnapshot | null = null;
  let scale = 1;
  let gridOn = false;
  let elapsed = 0;
  /** Avatars posés : frames de marche composées en Canvas 2D (§10.2), animées seulement par la boucle ambiante. */
  type Walker = {
    sprite: Sprite; avatar: SceneAvatar; plan: Segment[]; tileCm: number; frames: Map<string, Texture[]>;
    /** Horloge propre : elle s'arrête pendant une rencontre (LIV-02). */
    t: number; chat: { until: number; dir: WalkDir; bubble: Sprite | null } | null;
    /** Images en cours de composition (direction | sorte). */
    loading: Set<string>;
  };
  /** Rencontres récentes (paire → fin du délai avant la suivante) et leur nombre, pour varier les bulles. */
  const chatCooldown = new Map<string, number>();
  let chats = 0;
  const walkers: Walker[] = [];
  const avatarTextures = new Map<string, Promise<Texture[]>>();
  let generation = 0;
  const tex = (name: string | null | undefined) => (name ? atlas?.textures.get(name) : undefined);

  const px = (cm: number) => cm * scale;

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
      onAvatarReady?.();
    });
  }

  function drawGround(s: SceneSnapshot) {
    clearLayer(ground);
    const w = px(s.bounds.w);
    const h = px(s.bounds.h);
    // Dedans (serre), le carrelage. Dehors, l'herbe : une teinte de fond par saison, puis les 3 variantes de tuile
    // d'herbe alternées case par case (tirage fixe par position) et atténuées, pour garder la texture sans charger la
    // scène (demande de l'utilisateur du 2026-10-05).
    const floor = s.sceneZoneId ? tex('tuiles/sol-serre-carrelage-1.png') : undefined;
    if (floor) {
      ground.addChild(new TilingSprite({ texture: floor, width: w, height: h }));
      return;
    }
    ground.addChild(new Graphics().rect(0, 0, w, h).fill(s.sceneZoneId ? 0xe9e4da : GRASS_COLORS[s.ambient.season]));
    if (s.sceneZoneId || !atlas) return;
    const tiles = new Container();
    for (let y = 0; y * TILE_PX < h; y += 1) {
      for (let x = 0; x * TILE_PX < w; x += 1) {
        const t = tex(grassFrame(s.ambient.season, variantAt(x, y, 3) as 1 | 2 | 3)); // as: variantAt(…, 3) ∈ {1, 2, 3}
        if (t) tiles.addChild(Object.assign(new Sprite(t), { x: x * TILE_PX, y: y * TILE_PX, width: TILE_PX, height: TILE_PX }));
      }
    }
    tiles.alpha = GRASS_TEXTURE_ALPHA;
    ground.addChild(tiles);
  }

  /** Frame de fond d'une zone, dans sa variante saisonnière si elle existe (`tuiles/terre-1` → `tuiles/terre-hiver-1`). */
  function zoneFrame(typeCode: string, season: Season): string | undefined {
    const base = ZONE_FRAMES[typeCode];
    const m = base ? /^(.+?)-(\d)\.png$/.exec(base) : null;
    return (m?.[1] && m[2] ? seasonal(has, m[1], season, m[2]) : null) ?? base;
  }

  function drawZones(s: SceneSnapshot) {
    clearLayer(zoneLayer);
    const season = s.ambient.season;
    for (const z of [...s.zones].sort((a, b) => a.depth - b.depth)) {
      if (!z.geometry) continue;
      const { x, y, w, h } = z.geometry;
      // Planches et carrés en pièces (bords en bois, saisons, neige l'hiver, TER-05) ; les autres types en motif répété.
      const cols = Math.max(1, Math.round(w / s.tileSizeCm));
      const rows = Math.max(1, Math.round(h / s.tileSizeCm));
      const pieces = atlas ? zonePieces(z.typeCode, cols, rows, season, has) : null;
      if (pieces) {
        const pw = px(w) / cols;
        const ph = px(h) / rows;
        for (const p of pieces) {
          for (const frame of [p.frame, p.snow]) {
            const t = tex(frame);
            if (t) zoneLayer.addChild(Object.assign(new Sprite(t), { x: px(x) + p.x * pw, y: px(y) + p.y * ph, width: pw, height: ph }));
          }
        }
        continue;
      }
      const t = tex(zoneFrame(z.typeCode, season));
      if (t) zoneLayer.addChild(Object.assign(new TilingSprite({ texture: t, width: px(w), height: px(h) }), { x: px(x), y: px(y) }));
      const g = new Graphics().rect(px(x), px(y), px(w), px(h));
      if (!t) g.fill({ color: ZONE_COLORS[z.typeCode] ?? 0xb08a60, alpha: z.depth === 0 ? 0.55 : 0.9 });
      g.stroke({ width: 2, color: 0x2e222f, alpha: 0.6 });
      zoneLayer.addChild(g);
    }
  }

  /**
   * Terrain peint (§9.2) : une couche dual-grid par surface, dans l'ordre fixe, puis haies et clôtures raccordées.
   * Une case vaut une tuile (`TILE_PX`) quelle que soit l'échelle.
   */
  function drawTerrain(s: SceneSnapshot) {
    clearLayer(terrainLayer);
    let tiles = 0;
    let transitions = 0;
    if (!atlas) {
      const g = new Graphics();
      for (const c of s.terrain) g.rect(c.x * TILE_PX, c.y * TILE_PX, TILE_PX, TILE_PX).fill(TERRAIN_COLORS[c.kind] ?? 0xc6a879);
      terrainLayer.addChild(g);
      opts.onStats?.({ season: s.ambient.season, terrainTiles: s.terrain.length, terrainTransitions: 0 });
      return;
    }
    const draws: TileDraw[] = [...SURFACE_ORDER.flatMap((kind) => surfaceLayer(s.terrain, kind, s.ambient.season, has)), ...linearLayer(s.terrain, s.ambient.season, has)];
    for (const d of draws) {
      const t = tex(d.frame);
      if (!t) continue;
      terrainLayer.addChild(Object.assign(new Sprite(t), { x: d.x * TILE_PX, y: d.y * TILE_PX, width: TILE_PX, height: TILE_PX }));
      tiles += 1;
      if (d.frame.startsWith('transitions/')) transitions += 1;
    }
    opts.onStats?.({ season: loadedSeason === s.ambient.season ? s.ambient.season : null, terrainTiles: tiles, terrainTransitions: transitions });
  }

  /** Sprite d'un plant ; `alt` choisit la variante `-b` de la frame quand elle existe (casse l'effet clone, FIL-04). */
  function plantSprite(c: SceneCulture, alt: boolean): Sprite | Graphics {
    const r = atlas ? resolvePlantFrame(atlas.index, c.spriteKeys, c.phase, opts.onMissingSprite) : null;
    const variant = r?.frame && alt ? r.frame.replace(/\.png$/, '-b.png') : null;
    const t = tex(variant && has(variant) ? variant : r?.frame);
    if (t) {
      const sp = new Sprite(t);
      sp.anchor.set(0.5, 1);
      return sp;
    }
    // Substitution : une tige et un feuillage dont la taille suit la phase.
    const size = PHASE_SIZE[c.phase];
    return new Graphics().rect(-1, -size, 2, size).fill(0x4f6f35).circle(0, -size, size / 2).fill(PHASE_COLOR[c.phase]).stroke({ width: 1, color: 0x2e222f });
  }

  /** Cultures (FIL-01 à 06) : leurs plants en rangs dans leur bande ; les bulles d'état au-dessus du centre de la culture. */
  function drawPlants(s: SceneSnapshot) {
    clearLayer(plantLayer);
    clearLayer(bubbleLayer);
    for (const c of s.cultures) {
      if (!c.position) continue;
      const spots = c.footprint ? plantSpots(c.id, c.footprint, c.plants.drawn, s.tileSizeCm) : [{ ...c.position, mirror: false, alt: false }];
      for (const spot of spots) {
        const node = plantSprite(c, spot.alt);
        node.position.set(px(spot.x), px(spot.y));
        if (spot.mirror) node.scale.x = -1;
        // Tri de profondeur par le bas des sprites (§9.1).
        node.zIndex = spot.y;
        plantLayer.addChild(node);
      }
      const top = Math.min(...spots.map((p) => p.y));
      c.states.slice(0, MAX_VISIBLE_STATES).forEach((state, i) => {
        const bt = tex(STATE_FRAMES[state]);
        const bx = px(c.position?.x ?? 0) + (i - (Math.min(c.states.length, MAX_VISIBLE_STATES) - 1) / 2) * 18;
        const by = px(top) - 40;
        if (bt) bubbleLayer.addChild(Object.assign(new Sprite(bt), { x: bx - 8, y: by - 8 }));
        else bubbleLayer.addChild(new Graphics().circle(bx, by, 7).fill(STATE_COLORS[state] ?? 0xffffff).stroke({ width: 1, color: 0x2e222f }));
      });
    }
  }

  function decorNode(d: SceneDecor, season: Season): Sprite | Graphics {
    // L'arbre existant suit les saisons (étapes du pommier, TER-05).
    const t = tex(d.itemCode === 'existing_tree' ? existingTreeFrame(season, has) : decorFrame(d.spriteKey));
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
      const node = decorNode(d, s.ambient.season);
      node.position.set(px(d.x), px(d.y));
      node.zIndex = d.y;
      plantLayer.addChild(node);
    }
  }

  const toTexture = (c: HTMLCanvasElement | null) => {
    if (!c) return [];
    const t = Texture.from(c);
    t.source.resolution = 2;
    t.source.scaleMode = 'nearest';
    return [t];
  };

  type AvatarKind = 'act' | 'walk' | 'idle' | 'chat';
  /**
   * Images d'un avatar pour une direction, en cache par (`configHash`, direction, sorte, action), à la résolution des
   * sprites HD : son action (atlas de l'action chargé à cette occasion, LIV-01), sa marche ou sa pose à l'arrêt.
   */
  function avatarFrames(a: SceneAvatar, dir: WalkDir, kind: AvatarKind): Promise<Texture[]> {
    const key = `${a.configHash}|${dir}|${kind}|${kind === 'act' ? a.action ?? '' : ''}`;
    const playing = kind === 'chat' ? 'papoter' : kind === 'act' ? a.action : null;
    let p = avatarTextures.get(key);
    if (!p) {
      p = (async () => {
        if (playing) {
          const action = playing;
          const n = await actionFrameCount(action);
          const poses = Array.from({ length: n }, (_, i): Pose => `${action}-f${i + 1}`);
          const frames = (await Promise.all(poses.map((pose) => avatarCanvas(a.config, dir, pose, 'atlas', action)))).flatMap(toTexture);
          if (frames.length) return frames;
        }
        const poses: readonly Pose[] = kind === 'walk' ? WALK : ['arret'];
        return (await Promise.all(poses.map((pose) => avatarCanvas(a.config, dir, pose)))).flatMap(toTexture);
      })();
      avatarTextures.set(key, p);
    }
    return p;
  }

  /**
   * Avatars (§9.5, LIV-09) : chacun suit son trajet dans la zone de sa dernière action. Il est posé tout de suite sur
   * son premier point, de face, avec la première image de son action (image figée en animations réduites) ; les autres
   * directions se composent ensuite, sans bloquer l'affichage.
   */
  function drawAvatars(s: SceneSnapshot) {
    for (const w of walkers) w.chat?.bubble?.destroy();
    walkers.length = 0;
    const gen = generation;
    const obstacles = s.zones.flatMap((z) => (z.geometry ? [{ rect: z.geometry, typeCode: z.typeCode }] : []));
    for (const a of s.avatars) {
      // Plan (LIV-09, LIV-10) : tour de chaque zone où il a agi, chemins entre elles (LIV-03) ; ses zones restent ouvertes.
      const grid = a.areas.length > 1 ? walkGrid({ bounds: s.bounds, tileCm: s.tileSizeCm, zones: obstacles, cells: s.terrain, open: a.areas }) : null;
      const plan = avatarPlan(a.userId, a.areas, s.tileSizeCm, (from, to) => findPath(grid, from, to));
      const start = planMoment(plan, s.tileSizeCm, 0);
      const firstKind: AvatarKind = a.action ? 'act' : 'idle';
      void avatarFrames(a, start.dir, firstKind).then((frames) => {
        const first = frames[0];
        if (gen !== generation || !first) return;
        const sp = new Sprite(first);
        sp.anchor.set(0.5, 1);
        sp.position.set(px(start.at.x), px(start.at.y));
        sp.zIndex = start.at.y + 1;
        plantLayer.addChild(sp);
        const w: Walker = { sprite: sp, avatar: a, plan, tileCm: s.tileSizeCm, frames: new Map([[`${start.dir}|${firstKind}`, frames]]), t: 0, chat: null, loading: new Set() };
        walkers.push(w);
        onAvatarReady?.();
      });
    }
  }

  /** Bulle à pictogramme au-dessus d'un avatar (LIV-02) : pointe de la queue en (4, 29), en miroir vers la gauche. */
  function chatBubble(w: Walker, picto: string, dir: WalkDir): Sprite | null {
    const t = tex(`conversation/${picto}.png`);
    if (!t) return null;
    const b = new Sprite(t);
    b.anchor.set(4 / 32, 29 / 32);
    if (dir === 'gauche' && picto !== 'rire') b.scale.x = -1;
    b.position.set(w.sprite.x + 6, w.sprite.y - 40);
    b.zIndex = 100_000;
    plantLayer.addChild(b);
    return b;
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
    drawZones(s);
    drawGrid(s);
    drawPlants(s);
    drawDecor(s);
    generation += 1;
    drawAvatars(s);
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
      const z = snapshot.zones.find((x) => x.id === id);
      const c = snapshot.cultures.find((x) => x.id === id);
      if (z?.geometry) selection.rect(px(z.geometry.x), px(z.geometry.y), px(z.geometry.w), px(z.geometry.h)).stroke({ width: 3, color: 0xf2c14e });
      else if (c?.footprint) selection.rect(px(c.footprint.x), px(c.footprint.y), px(c.footprint.w), px(c.footprint.h)).stroke({ width: 3, color: 0xf2c14e });
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
      // Trajet (LIV-09, LIV-10) : action à chaque point de ses zones, marche entre elles, face à la direction de la marche.
      const moments = walkers.map((w) => {
        if (!w.chat) w.t += ms;
        return planMoment(w.plan, w.tileCm, w.t);
      });
      // Rencontres (LIV-02) : deux avatars proches s'arrêtent, se font face et échangent une bulle à pictogramme.
      const free = walkers.flatMap((w, i) => (w.chat ? [] : [{ id: String(i), at: moments[i]?.at ?? { x: 0, y: 0 } }]));
      for (const [ia, ib] of chatPairs(free, walkers[0]?.tileCm ?? 50)) {
        const a = walkers[Number(ia)];
        const b = walkers[Number(ib)];
        const ma = moments[Number(ia)];
        const mb = moments[Number(ib)];
        if (!a || !b || !ma || !mb) continue;
        const pair = [a.avatar.userId, b.avatar.userId].sort().join('|');
        if ((chatCooldown.get(pair) ?? 0) > elapsed) continue;
        chatCooldown.set(pair, elapsed + CHAT_MS + 15_000);
        const picto = chatPicto(a.avatar.userId, b.avatar.userId, (chats += 1));
        for (const [w, from, to] of [[a, ma.at, mb.at], [b, mb.at, ma.at]] as const) {
          const dir = walkDir(from, to);
          w.chat = { until: elapsed + CHAT_MS, dir, bubble: chatBubble(w, w === a ? picto : chatPicto(b.avatar.userId, a.avatar.userId, chats), dir) };
        }
      }
      walkers.forEach((w, i) => {
        const m = moments[i];
        if (!m) return;
        if (w.chat && w.chat.until <= elapsed) {
          w.chat.bubble?.destroy();
          w.chat = null;
        }
        const kind: AvatarKind = w.chat ? 'chat' : m.mode === 'walk' ? 'walk' : w.avatar.action ? 'act' : 'idle';
        const dir = w.chat?.dir ?? m.dir;
        // Images composées au premier besoin seulement : rien de lourd au chargement de la vue.
        const key = `${dir}|${kind}`;
        if (!w.frames.has(key) && !w.loading.has(key)) {
          w.loading.add(key);
          void avatarFrames(w.avatar, dir, kind).then((f) => { if (f.length) w.frames.set(key, f); });
        }
        const frames = w.frames.get(`${dir}|${kind}`) ?? (kind === 'chat' ? w.frames.get(`${dir}|idle`) ?? w.frames.get(`${dir}|${w.avatar.action ? 'act' : 'idle'}`) : w.frames.get(`bas|${kind}`));
        const step = kind === 'walk' ? 180 : 260;
        const f = frames?.[Math.floor((w.chat ? elapsed : m.elapsedMs) / step) % frames.length];
        if (f) w.sprite.texture = f;
        if (!w.chat) {
          w.sprite.position.set(px(m.at.x), px(m.at.y));
          w.sprite.zIndex = m.at.y + 1;
        }
      });
    },
    render() {
      app.render();
    },
    destroy() {
      app.destroy({ removeView: true }, { children: true });
    },
  };
}
