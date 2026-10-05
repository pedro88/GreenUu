/*
 * Trajet d'un avatar dans la zone de sa dernière action (SPEC §9.5, LIV-09) : il joue son action à un point de la
 * zone, marche vers le point suivant, y rejoue l'action, et ainsi de suite, en boucle. Tout est tiré de son identifiant
 * (pas d'aléatoire au rendu) et calculé à partir du temps écoulé : l'état à un instant donné est toujours le même.
 * Unités : centimètres de la scène et millisecondes.
 */

export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; w: number; h: number };
export type WalkDir = 'bas' | 'gauche' | 'haut' | 'droite';
export type AvatarMoment = { at: Point; dir: WalkDir; mode: 'walk' | 'act'; /** Temps écoulé dans ce mode. */ elapsedMs: number };

/** Points visités par tour ; vitesse de marche (en tuiles par seconde) ; durée de l'action à chaque point. */
export const ROUTE_POINTS = 4;
export const WALK_TILES_PER_S = 1.2;
export const ACT_MS = 2600;

/** Générateur pseudo-aléatoire déterministe (mulberry32), amorcé par une chaîne. */
function seeded(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Points du trajet, dans l'emprise de la zone (marge d'un quart de tuile, pour que les pieds restent sur la zone) ;
 * deux points successifs sont écartés d'au moins un tiers de la plus petite dimension quand la zone le permet.
 */
export function avatarRoute(seed: string, rect: Rect, tileCm: number, count = ROUTE_POINTS): Point[] {
  const rnd = seeded(seed);
  const margin = Math.min(tileCm / 4, rect.w / 4, rect.h / 4);
  const x0 = rect.x + margin;
  const y0 = rect.y + margin;
  const w = Math.max(0, rect.w - 2 * margin);
  const h = Math.max(0, rect.h - 2 * margin);
  const gap = Math.min(w, h) / 3;
  const out: Point[] = [];
  for (let i = 0; i < count; i += 1) {
    let p = { x: Math.round(x0 + rnd() * w), y: Math.round(y0 + rnd() * h) };
    for (let k = 0; k < 8 && out.length && Math.hypot(p.x - (out.at(-1)?.x ?? 0), p.y - (out.at(-1)?.y ?? 0)) < gap; k += 1) {
      p = { x: Math.round(x0 + rnd() * w), y: Math.round(y0 + rnd() * h) };
    }
    out.push(p);
  }
  return out;
}

/** Direction d'une marche : l'axe dominant du déplacement. */
export function walkDir(from: Point, to: Point): WalkDir {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'droite' : 'gauche';
  return dy >= 0 ? 'bas' : 'haut';
}

/**
 * État de l'avatar à l'instant `t` du tour : action au point i, puis marche vers le point i + 1, etc. À `t = 0`, il
 * joue son action au premier point, de face (c'est aussi l'image figée en animations réduites).
 */
export function avatarMoment(route: Point[], tileCm: number, t: number): AvatarMoment {
  const first = route[0] ?? { x: 0, y: 0 };
  if (route.length < 2) return { at: first, dir: 'bas', mode: 'act', elapsedMs: t % ACT_MS };
  const speed = (WALK_TILES_PER_S * tileCm) / 1000; // cm par ms
  const legs = route.map((p, i) => {
    const q = route[(i + 1) % route.length] ?? p;
    return { from: p, to: q, walkMs: Math.hypot(q.x - p.x, q.y - p.y) / speed };
  });
  const cycle = legs.reduce((s, l) => s + ACT_MS + l.walkMs, 0);
  let rest = ((t % cycle) + cycle) % cycle;
  let dir: WalkDir = walkDir(legs[legs.length - 1]?.from ?? first, first);
  for (const [i, l] of legs.entries()) {
    if (rest < ACT_MS) return { at: l.from, dir: i === 0 && t < cycle ? 'bas' : dir, mode: 'act', elapsedMs: rest };
    rest -= ACT_MS;
    dir = walkDir(l.from, l.to);
    if (rest < l.walkMs) {
      const k = rest / l.walkMs;
      return { at: { x: l.from.x + (l.to.x - l.from.x) * k, y: l.from.y + (l.to.y - l.from.y) * k }, dir, mode: 'walk', elapsedMs: rest };
    }
    rest -= l.walkMs;
  }
  return { at: first, dir: 'bas', mode: 'act', elapsedMs: 0 };
}

/*
 * Plusieurs zones (LIV-10) : l'avatar fait le tour de chaque zone où il a agi dans les 24 h (action à chaque point),
 * puis va à la suivante par un chemin (LIV-03), et revient à la première. Un plan est une suite d'étapes : agir à un
 * point, ou marcher le long d'une ligne brisée.
 */
export type Segment = { kind: 'act'; at: Point } | { kind: 'walk'; path: Point[] };
export type PathFinder = (from: Point, to: Point, fromZone: number, toZone: number) => Point[];

export function avatarPlan(seed: string, zones: Rect[], tileCm: number, between: PathFinder): Segment[] {
  if (!zones.length) return [];
  const routes = zones.map((z, i) => avatarRoute(`${seed}#${i}`, z, tileCm, zones.length > 1 ? 3 : ROUTE_POINTS));
  const out: Segment[] = [];
  routes.forEach((route, i) => {
    route.forEach((p, k) => {
      out.push({ kind: 'act', at: p });
      const next = route[k + 1];
      if (next) out.push({ kind: 'walk', path: [p, next] });
    });
    const last = route.at(-1);
    const nextZone = (i + 1) % routes.length;
    const target = routes[nextZone]?.[0];
    if (!last || !target) return;
    // Une seule zone : on referme le tour à l'intérieur ; sinon, le chemin vers la zone suivante.
    out.push({ kind: 'walk', path: routes.length === 1 ? [last, target] : between(last, target, i, nextZone) });
  });
  return out;
}

const pathLength = (path: Point[]) => path.slice(1).reduce((s, p, i) => s + Math.hypot(p.x - (path[i]?.x ?? 0), p.y - (path[i]?.y ?? 0)), 0);

/** État de l'avatar à l'instant `t` d'un plan (même contrat qu'`avatarMoment`). */
export function planMoment(plan: Segment[], tileCm: number, t: number): AvatarMoment {
  const first = plan[0]?.kind === 'act' ? plan[0].at : { x: 0, y: 0 };
  const speed = (WALK_TILES_PER_S * tileCm) / 1000;
  const durations = plan.map((s) => (s.kind === 'act' ? ACT_MS : pathLength(s.path) / speed));
  const cycle = durations.reduce((s, d) => s + d, 0);
  if (!cycle) return { at: first, dir: 'bas', mode: 'act', elapsedMs: 0 };
  let rest = ((t % cycle) + cycle) % cycle;
  let dir: WalkDir = 'bas';
  for (const [i, s] of plan.entries()) {
    const d = durations[i] ?? 0;
    if (s.kind === 'walk') {
      if (rest < d) {
        // Position sur la ligne brisée, et direction du tronçon en cours.
        let along = rest * speed;
        for (const [k, p] of s.path.slice(1).entries()) {
          const a = s.path[k] ?? p;
          const len = Math.hypot(p.x - a.x, p.y - a.y);
          if (along <= len || k === s.path.length - 2) {
            const r = len ? Math.min(1, along / len) : 1;
            return { at: { x: a.x + (p.x - a.x) * r, y: a.y + (p.y - a.y) * r }, dir: walkDir(a, p), mode: 'walk', elapsedMs: rest };
          }
          along -= len;
        }
      }
      const a = s.path.at(-2);
      const b = s.path.at(-1);
      if (a && b) dir = walkDir(a, b);
    } else if (rest < d) {
      return { at: s.at, dir: i === 0 && t < cycle ? 'bas' : dir, mode: 'act', elapsedMs: rest };
    }
    rest -= d;
  }
  return { at: first, dir: 'bas', mode: 'act', elapsedMs: 0 };
}

/*
 * Rencontres (LIV-02) : deux avatars à moins de 2 tuiles se tournent l'un vers l'autre et échangent des bulles à
 * pictogramme, jamais de texte.
 */
export const CHAT_PICTOS = ['points', 'coeur', 'plante', 'soleil', 'goutte', 'rire'] as const;
export const CHAT_MS = 3000;

export function chatPairs(avatars: { id: string; at: Point }[], tileCm: number): [string, string][] {
  const out: [string, string][] = [];
  const busy = new Set<string>();
  const sorted = [...avatars].sort((a, b) => (a.id < b.id ? -1 : 1));
  for (const [i, a] of sorted.entries()) {
    if (busy.has(a.id)) continue;
    for (const b of sorted.slice(i + 1)) {
      if (busy.has(b.id)) continue;
      if (Math.hypot(a.at.x - b.at.x, a.at.y - b.at.y) < 2 * tileCm) {
        out.push([a.id, b.id]);
        busy.add(a.id).add(b.id);
        break;
      }
    }
  }
  return out;
}

/** Pictogramme d'une bulle : tiré de la paire et du numéro de la rencontre. */
export function chatPicto(a: string, b: string, n: number): (typeof CHAT_PICTOS)[number] {
  let h = n;
  for (const c of `${a}|${b}`) h = (Math.imul(h, 31) + c.charCodeAt(0)) | 0;
  return CHAT_PICTOS[Math.abs(h) % CHAT_PICTOS.length] ?? 'points';
}
