import { type Container, Sprite, Texture } from 'pixi.js';
import { actionFrameCount, avatarCanvas, WALK, type Pose } from '@/features/avatar/compose';
import { avatarPlan, CHAT_MS, chatPairs, chatPicto, planMoment, walkDir, type AvatarMoment, type Segment, type WalkDir } from '@/features/scene/avatar-route.pure';
import { findPath, walkGrid } from '@/features/scene/path.pure';
import type { SceneAvatar, SceneSnapshot } from '@/features/scene/snapshot.schema';
import type { RenderCtx } from './atlas';

/*
 * Avatars de la vue jardin (SPEC §9.5, LIV-01 à LIV-10) : chacun suit son plan dans les zones où il a agi (action à
 * chaque point, marche entre elles, chemins qui évitent les structures), et deux avatars qui se croisent échangent une
 * bulle à pictogramme. Les images sont composées en Canvas 2D (§10.2) au premier besoin.
 */

type AvatarKind = 'act' | 'walk' | 'idle' | 'chat';
type Walker = {
  sprite: Sprite; avatar: SceneAvatar; plan: Segment[]; tileCm: number; frames: Map<string, Texture[]>;
  /** Horloge propre : elle s'arrête pendant une rencontre (LIV-02). */
  t: number; chat: { until: number; dir: WalkDir; bubble: Sprite | null } | null;
  /** Images en cours de composition (direction | sorte). */
  loading: Set<string>;
};

/** Délai avant qu'une même paire se reparle, après une rencontre. */
const CHAT_COOLDOWN_MS = 15_000;
const WALK_FRAME_MS = 180;
const ACT_FRAME_MS = 260;

const toTexture = (c: HTMLCanvasElement | null) => {
  if (!c) return [];
  const t = Texture.from(c);
  t.source.resolution = 2;
  t.source.scaleMode = 'nearest';
  return [t];
};

export function createAvatarLayer(ctx: RenderCtx, layer: Container, onReady?: () => void) {
  const walkers: Walker[] = [];
  const textures = new Map<string, Promise<Texture[]>>();
  /** Rencontres récentes (paire → fin du délai avant la suivante) et leur nombre, pour varier les bulles. */
  const cooldown = new Map<string, number>();
  let chats = 0;
  let generation = 0;

  /**
   * Images d'un avatar pour une direction, en cache par (`configHash`, direction, sorte, action), à la résolution des
   * sprites HD : son action (atlas de l'action chargé à cette occasion, LIV-01), sa marche ou sa pose à l'arrêt.
   */
  function frames(a: SceneAvatar, dir: WalkDir, kind: AvatarKind): Promise<Texture[]> {
    const key = `${a.configHash}|${dir}|${kind}|${kind === 'act' ? a.action ?? '' : ''}`;
    const playing = kind === 'chat' ? 'papoter' : kind === 'act' ? a.action : null;
    let p = textures.get(key);
    if (!p) {
      p = (async () => {
        if (playing) {
          const n = await actionFrameCount(playing);
          const poses = Array.from({ length: n }, (_, i): Pose => `${playing}-f${i + 1}`);
          const out = (await Promise.all(poses.map((pose) => avatarCanvas(a.config, dir, pose, 'atlas', playing)))).flatMap(toTexture);
          if (out.length) return out;
        }
        const poses: readonly Pose[] = kind === 'walk' ? WALK : ['arret'];
        return (await Promise.all(poses.map((pose) => avatarCanvas(a.config, dir, pose)))).flatMap(toTexture);
      })();
      textures.set(key, p);
    }
    return p;
  }

  /** Bulle à pictogramme au-dessus d'un avatar (LIV-02) : pointe de la queue en (4, 29), en miroir vers la gauche. */
  function bubble(w: Walker, picto: string, dir: WalkDir): Sprite | null {
    const t = ctx.tex(`conversation/${picto}.png`);
    if (!t) return null;
    const b = new Sprite(t);
    b.anchor.set(4 / 32, 29 / 32);
    if (dir === 'gauche' && picto !== 'rire') b.scale.x = -1;
    b.position.set(w.sprite.x + 6, w.sprite.y - 40);
    b.zIndex = 100_000;
    layer.addChild(b);
    return b;
  }

  /**
   * Pose les avatars d'un instantané : chacun tout de suite sur son premier point, de face, avec la première image de
   * son action (image figée en animations réduites).
   */
  function draw(s: SceneSnapshot) {
    for (const w of walkers) w.chat?.bubble?.destroy();
    walkers.length = 0;
    generation += 1;
    const gen = generation;
    const obstacles = s.zones.flatMap((z) => (z.geometry ? [{ rect: z.geometry, typeCode: z.typeCode }] : []));
    for (const a of s.avatars) {
      // Plan (LIV-09, LIV-10) : tour de chaque zone où il a agi, chemins entre elles (LIV-03) ; ses zones restent ouvertes.
      const grid = a.areas.length > 1 ? walkGrid({ bounds: s.bounds, tileCm: s.tileSizeCm, zones: obstacles, cells: s.terrain, open: a.areas }) : null;
      const plan = avatarPlan(a.userId, a.areas, s.tileSizeCm, (from, to) => findPath(grid, from, to));
      const start = planMoment(plan, s.tileSizeCm, 0);
      const firstKind: AvatarKind = a.action ? 'act' : 'idle';
      void frames(a, start.dir, firstKind).then((f) => {
        const first = f[0];
        if (gen !== generation || !first) return;
        const sp = new Sprite(first);
        sp.anchor.set(0.5, 1);
        sp.position.set(ctx.px(start.at.x), ctx.px(start.at.y));
        sp.zIndex = start.at.y + 1;
        layer.addChild(sp);
        walkers.push({ sprite: sp, avatar: a, plan, tileCm: s.tileSizeCm, frames: new Map([[`${start.dir}|${firstKind}`, f]]), t: 0, chat: null, loading: new Set() });
        onReady?.();
      });
    }
  }

  /** Rencontres (LIV-02) : deux avatars proches s'arrêtent, se font face et échangent une bulle à pictogramme. */
  function startChats(moments: AvatarMoment[], elapsed: number) {
    const free = walkers.flatMap((w, i) => (w.chat ? [] : [{ id: String(i), at: moments[i]?.at ?? { x: 0, y: 0 } }]));
    for (const [ia, ib] of chatPairs(free, walkers[0]?.tileCm ?? 50)) {
      const a = walkers[Number(ia)];
      const b = walkers[Number(ib)];
      const ma = moments[Number(ia)];
      const mb = moments[Number(ib)];
      if (!a || !b || !ma || !mb) continue;
      const pair = [a.avatar.userId, b.avatar.userId].sort().join('|');
      if ((cooldown.get(pair) ?? 0) > elapsed) continue;
      cooldown.set(pair, elapsed + CHAT_MS + CHAT_COOLDOWN_MS);
      chats += 1;
      for (const [w, from, to, other] of [[a, ma.at, mb.at, b], [b, mb.at, ma.at, a]] as const) {
        const dir = walkDir(from, to);
        w.chat = { until: elapsed + CHAT_MS, dir, bubble: bubble(w, chatPicto(w.avatar.userId, other.avatar.userId, chats), dir) };
      }
    }
  }

  /** Avance les avatars de `ms` (boucle d'animation ; jamais appelée en animations réduites). */
  function animate(ms: number, elapsed: number) {
    const moments = walkers.map((w) => {
      if (!w.chat) w.t += ms;
      return planMoment(w.plan, w.tileCm, w.t);
    });
    startChats(moments, elapsed);
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
        void frames(w.avatar, dir, kind).then((f) => { if (f.length) w.frames.set(key, f); });
      }
      const fallback = kind === 'chat' ? w.frames.get(`${dir}|${w.avatar.action ? 'act' : 'idle'}`) : w.frames.get(`bas|${kind}`);
      const list = w.frames.get(key) ?? fallback;
      const f = list?.[Math.floor((w.chat ? elapsed : m.elapsedMs) / (kind === 'walk' ? WALK_FRAME_MS : ACT_FRAME_MS)) % list.length];
      if (f) w.sprite.texture = f;
      if (!w.chat) {
        w.sprite.position.set(ctx.px(m.at.x), ctx.px(m.at.y));
        w.sprite.zIndex = m.at.y + 1;
      }
    });
  }

  return { draw, animate };
}
