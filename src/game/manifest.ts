import { z } from 'zod';
import type { VisualPhase, VisualState } from '@/features/scene/phase.pure';

/*
 * Contrat avec les assets visuels (SPEC §9.2). L'atlas est livré au format JSON TexturePacker (§17 Q-17) ; les noms de
 * frames suivent SPRITES.md (`cultures/tomate-4-floraison.png`). Ce module construit l'index (clé, phase) → frame et
 * applique la chaîne de repli variété → espèce → famille → `unknown_plant`. Il ne lève jamais : sans atlas, le moteur
 * dessine des assets de substitution.
 */

const rect = z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() });
/* Les sprites HD (`out_hd/`, SPRITES.md) sont livrés en plusieurs pages ; la première liste les suivantes. */
export const atlasSchema = z.object({
  frames: z.record(z.string(), z.object({ frame: rect, sourceSize: z.object({ w: z.number(), h: z.number() }).optional(), anchor: z.object({ x: z.number(), y: z.number() }).optional() })),
  animations: z.record(z.string(), z.array(z.string())).optional(),
  meta: z.object({ image: z.string(), size: z.object({ w: z.number(), h: z.number() }), related_multi_packs: z.array(z.string().regex(/^[\w-]+\.json$/)).optional() }),
});
export type Atlas = z.infer<typeof atlasSchema>;

/** Taille logique d'une tuile (§9.2) ; les assets HD la dessinent en 64 px. */
export const LOGICAL_TILE_PX = 32;
const REFERENCE_TILE = 'tuiles/herbe-1.png';

/**
 * Résolution des assets livrés : 2 pour les sprites HD (tuile de référence de 64 px), 1 sinon. Les textures sont
 * affichées à leur taille logique, donc plus nettes au zoom, sans changer la grille.
 */
export function assetResolution(frames: Atlas['frames']): number {
  const w = frames[REFERENCE_TILE]?.frame.w;
  return w && w > LOGICAL_TILE_PX ? Math.max(1, Math.round(w / LOGICAL_TILE_PX)) : 1;
}

export const ATLAS_URL = '/sprites/atlas/atlas.json';
/** Atlas de l'avatar, séparé de celui de la scène : seulement les poses composées (arrêt, marche). */
export const AVATAR_ATLAS_URL = '/sprites/atlas/avatar-atlas.json';

export type AtlasFrame = { page: string; x: number; y: number; w: number; h: number };
export type LoadedAtlas = { frames: Map<string, AtlasFrame>; pages: string[]; resolution: number; index: PhaseIndex };

/**
 * Lit un atlas et toutes ses pages (`related_multi_packs`), validés par Zod. Sans atlas lisible : null, et le moteur
 * dessine des assets de substitution (§9.2). La scène PixiJS lit `ATLAS_URL`, la composition Canvas 2D de l'avatar
 * `AVATAR_ATLAS_URL` : aucun des deux ne télécharge les frames de l'autre.
 */
export async function fetchAtlas(url = ATLAS_URL): Promise<LoadedAtlas | null> {
  try {
    const base = url.replace(/[^/]+$/, '');
    const read = async (name: string) => {
      const res = await fetch(base + name);
      if (!res.ok) return null;
      const parsed = atlasSchema.safeParse(await res.json());
      return parsed.success ? parsed.data : null;
    };
    const main = await read(url.slice(base.length));
    if (!main) return null;
    const rest = await Promise.all((main.meta.related_multi_packs ?? []).map(read));
    const pages = [main, ...rest.filter((a): a is Atlas => a !== null)];
    const frames = new Map<string, AtlasFrame>();
    for (const a of pages) for (const [k, f] of Object.entries(a.frames)) if (!frames.has(k)) frames.set(k, { page: base + a.meta.image, ...f.frame });
    const all = Object.assign({}, ...pages.map((a) => a.frames)) as Atlas['frames']; // as: union des frames des pages
    return { frames, pages: pages.map((a) => base + a.meta.image), resolution: assetResolution(all), index: buildPhaseIndex({ frames: all, meta: main.meta }) };
  } catch {
    return null;
  }
}

/** Mot d'étape des noms de frames (SPRITES.md §1) → phase visuelle générique. */
const STAGE_WORDS: Record<string, VisualPhase> = {
  graine: 'seed', plantation: 'seed', levee: 'sprout', debourrement: 'sprout', bourgeons: 'sprout', croissance: 'growing', feuillage: 'growing',
  floraison: 'flowering', 'fruits-verts': 'fruiting', fruits: 'fruiting', recolte: 'harvest_ready', 'montee-graine': 'seed_set',
  dormance: 'dormant', hiver: 'dormant', automne: 'finished',
};

/** Phases de remplacement, dans l'ordre, quand une clé n'a pas de frame pour la phase demandée. */
const PHASE_FALLBACK: Record<VisualPhase, VisualPhase[]> = {
  seed: ['sprout', 'growing'], sprout: ['seed', 'growing'], growing: ['sprout', 'flowering'], flowering: ['growing', 'fruiting'],
  fruiting: ['flowering', 'harvest_ready', 'growing'], harvest_ready: ['fruiting', 'flowering', 'growing'], seed_set: ['harvest_ready', 'fruiting', 'growing'],
  dormant: ['seed', 'sprout', 'growing'], finished: ['seed_set', 'harvest_ready', 'growing'],
};

export const UNKNOWN_PLANT = 'unknown_plant';
/** Code botanique (`solanaceae`) ↔ nom de dossier de l'atlas (`solanacees`). */
export const familyKey = (code: string) => `family:${code}`;
const familyFromFolder = (name: string) => (name === 'inconnue' ? UNKNOWN_PLANT : familyKey(name.replace(/acees$/, 'aceae')));

export type PhaseIndex = Map<string, Map<VisualPhase, string>>;

/** Index des frames de plantes : `cultures/` et `fleurs/` par clé d'espèce, `familles/` par famille. */
export function buildPhaseIndex(atlas: Atlas | null): PhaseIndex {
  const index: PhaseIndex = new Map();
  if (!atlas) return index;
  for (const name of Object.keys(atlas.frames)) {
    const m = /^(cultures|fleurs|familles)\/(.+?)-(\d)-(.+)\.png$/.exec(name);
    if (!m?.[1] || !m[2] || !m[4]) continue;
    const phase = STAGE_WORDS[m[4]];
    if (!phase) continue;
    const key = m[1] === 'familles' ? familyFromFolder(m[2]) : m[2];
    const phases = index.get(key) ?? new Map<VisualPhase, string>();
    if (!phases.has(phase)) phases.set(phase, name);
    index.set(key, phases);
  }
  return index;
}

export type Resolved = { frame: string | null; key: string; fallbackDepth: number };

/**
 * Frame d'une plante (MAP-07) : la première clé connue de la chaîne, puis la phase la plus proche disponible pour cette clé.
 * `onFallback` est appelé quand une clé demandée est absente (alerte en dev, §9.2).
 */
export function resolvePlantFrame(index: PhaseIndex, keys: (string | null | undefined)[], phase: VisualPhase, onFallback?: (missing: string) => void): Resolved {
  const chain = [...keys.filter((k): k is string => !!k), UNKNOWN_PLANT];
  for (const [depth, key] of chain.entries()) {
    const phases = index.get(key);
    if (!phases) {
      if (key !== UNKNOWN_PLANT) onFallback?.(key);
      continue;
    }
    for (const p of [phase, ...PHASE_FALLBACK[phase]]) {
      const frame = phases.get(p);
      if (frame) return { frame, key, fallbackDepth: depth };
    }
    const any = phases.values().next().value;
    if (any) return { frame: any, key, fallbackDepth: depth };
  }
  return { frame: null, key: UNKNOWN_PLANT, fallbackDepth: chain.length - 1 };
}

/** Bulles d'état (§9.4) → frames `bulles/`. */
export const STATE_FRAMES: Record<VisualState, string> = {
  overdue_ticket: 'bulles/ticket-retard.png', thirsty: 'bulles/soif.png', disease: 'bulles/maladie.png', pest: 'bulles/ravageur.png',
  harvest_ready: 'bulles/recolte.png', needs_confirmation: 'bulles/observation.png', assigned_to_me: 'bulles/ticket-assigne.png',
};

/** Éléments de terrain (`terrain:<kind>`, §9.2) → frame de l'atlas, avec variante saisonnière éventuelle de l'herbe. */
export const TERRAIN_FRAMES: Record<string, string> = {
  path: 'tuiles/terre-battue-1.png', gravel_path: 'tuiles/gravier-1.png', stepping_stones: 'tuiles/dalles-1.png', water_point: 'structures/robinet.png',
  rain_barrel: 'structures/recuperateur-eau.png', hedge: 'structures/haie-seule.png', existing_tree: 'cultures/pommier-4-feuillage.png',
  fence: 'structures/cloture-h.png', gate: 'structures/portail-ferme.png',
};

/** Fond d'une zone selon son type (les structures plus riches, en 9 pièces, viendront avec l'atlas complet). */
export const ZONE_FRAMES: Record<string, string> = {
  bed: 'tuiles/terre-1.png', row: 'tuiles/terre-2.png', square_bed: 'structures/bac-1x1.png', container: 'structures/bac-1x1.png', pot: 'structures/pot.png',
  greenhouse: 'tuiles/sol-serre-carrelage-1.png', tunnel: 'tuiles/sol-serre-beton-1.png', bench: 'structures/table-centre.png', nursery: 'tuiles/terre-nue-1.png',
  seed_tray: 'structures/plaque-alveolee-vide.png', cell: 'structures/godets-vide.png', compost: 'structures/composteur-plein.png',
  orchard: 'tuiles/herbe-2.png', fruit_hedge: 'tuiles/paillage-brf-1.png', flower_bed: 'tuiles/paillage-paille-1.png', meadow: 'tuiles/herbe-3.png',
  path: 'tuiles/gravier-2.png', plot: 'tuiles/terre-nue-2.png',
};

export function grassFrame(season: 'spring' | 'summer' | 'autumn' | 'winter', variant: 1 | 2 | 3): string {
  return season === 'summer' ? `tuiles/herbe-${variant}.png` : `tuiles/herbe-${season === 'spring' ? 'printemps' : season === 'autumn' ? 'automne' : 'hiver'}-${variant}.png`;
}
