import { z } from 'zod';
import { AVATAR_LAYERS, REQUIRED_AVATAR_LAYERS, type AvatarLayer, type PaletteSlot } from '@/lib/enums';
import { isUnlocked, type UnlockFacts } from '../progression/unlock.pure';
import { AVATAR_SPRITES } from '@/generated/avatar-sprites';
import { AVATAR_ITEMS, allowedPalettes, PALETTES, type AvatarItemDef } from './catalog';

/* Configuration d'avatar (SPEC §10.3) : schéma, contrôle complet, avatar par défaut et tirage aléatoire. */

const layerEntry = z.object({
  item: z.string().max(60).nullable(),
  palettes: z.array(z.string().max(60)).max(2).default([]),
});

export const avatarConfigSchema = z.object({
  v: z.literal(1),
  layers: z.partialRecord(z.enum(AVATAR_LAYERS), layerEntry),
}).superRefine((c, ctx) => {
  // AVT-04 : les calques obligatoires n'acceptent pas « aucun ».
  for (const l of REQUIRED_AVATAR_LAYERS) {
    if (!c.layers[l]?.item) ctx.addIssue({ code: 'custom', path: ['layers', l, 'item'], message: 'required' });
  }
});

export type AvatarConfigV1 = { v: 1; layers: Partial<Record<AvatarLayer, { item: string | null; palettes: string[] }>> };

/** Tous les calques, dans l'ordre de composition ; un calque absent vaut « aucun ». */
export function normalizeConfig(c: AvatarConfigV1): AvatarConfigV1 {
  return { v: 1, layers: Object.fromEntries(AVATAR_LAYERS.map((l) => [l, { item: c.layers[l]?.item ?? null, palettes: c.layers[l]?.item ? [...(c.layers[l]?.palettes ?? [])] : [] }])) };
}

/** JSON canonique (clés triées) : base du `config_hash` (§10.3). */
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.entries(v).filter(([, x]) => x !== undefined).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, x]) => `${JSON.stringify(k)}:${canonicalJson(x)}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

/** Vue du catalogue utilisée pour le contrôle : celle de la base côté serveur, celle du code dans les tests. */
export type CatalogView = {
  items: ReadonlyMap<string, {
    layer: AvatarLayer; slots: PaletteSlot[]; unlocked: boolean; allowed: ReadonlySet<string>[];
    /** Sprites livrés (`AVATAR_SPRITES`) : un élément sans sprite n'est ni proposé ni accepté. */
    available: boolean;
    /** Corps dont le sprite comprend la tête : aucune forme de visage par-dessus. */
    includesHead?: boolean | undefined;
  }>;
  palettes: ReadonlyMap<string, PaletteSlot>;
};

export function codeCatalogView(facts: UnlockFacts, sprites: ReadonlySet<string> = AVATAR_SPRITES): CatalogView {
  return {
    items: new Map(AVATAR_ITEMS.map((i) => [i.code, {
      layer: i.layer, slots: i.slots, unlocked: isUnlocked(i.unlock, facts), allowed: i.slots.map((_, k) => new Set(allowedPalettes(i, k).map((p) => p.code))),
      available: sprites.has(i.spriteKey), includesHead: i.includesHead,
    }])),
    palettes: new Map(PALETTES.map((p) => [p.code, p.slot])),
  };
}

export type ConfigCheck =
  | { ok: true; config: AvatarConfigV1 }
  | { ok: false; code: 'VALIDATION'; fields: Record<string, string[]> }
  | { ok: false; code: 'LOCKED_ITEM'; items: string[] };

/**
 * Revalidation complète (§10.3) : schéma, élément du bon calque et livré, palettes autorisées et compatibles, tête
 * cohérente avec le corps, déblocage. Un élément déjà équipé dans `previous` reste accepté même si sa condition n'est
 * plus remplie.
 */
export function checkConfig(raw: unknown, view: CatalogView, previous?: AvatarConfigV1 | null): ConfigCheck {
  const parsed = avatarConfigSchema.safeParse(raw);
  if (!parsed.success) {
    const fields: Record<string, string[]> = {};
    for (const i of parsed.error.issues) (fields[i.path.join('.') || '_form'] ??= []).push(i.message);
    return { ok: false, code: 'VALIDATION', fields };
  }
  const config = normalizeConfig(parsed.data);
  const fields: Record<string, string[]> = {};
  const locked: string[] = [];
  for (const layer of AVATAR_LAYERS) {
    const entry = config.layers[layer];
    if (!entry?.item) continue;
    const item = view.items.get(entry.item);
    if (!item || item.layer !== layer) { (fields[`layers.${layer}.item`] ??= []).push('unknownItem'); continue; }
    if (!item.available) { (fields[`layers.${layer}.item`] ??= []).push('itemUnavailable'); continue; }
    if (entry.palettes.length !== item.slots.length) { (fields[`layers.${layer}.palettes`] ??= []).push('paletteCount'); continue; }
    entry.palettes.forEach((code, k) => {
      if (view.palettes.get(code) !== item.slots[k] || !item.allowed[k]?.has(code)) (fields[`layers.${layer}.palettes`] ??= []).push('paletteNotAllowed');
    });
    if (!item.unlocked && previous?.layers[layer]?.item !== entry.item) locked.push(entry.item);
  }
  // Un corps sans tête exige une forme de visage ; un corps qui comprend la tête n'en accepte pas.
  const body = config.layers.body?.item ? view.items.get(config.layers.body.item) : undefined;
  const head = config.layers.head?.item ?? null;
  if (body && body.layer === 'body' && body.includesHead && head) (fields['layers.head.item'] ??= []).push('headIncludedInBody');
  if (body && body.layer === 'body' && !body.includesHead && !head) (fields['layers.head.item'] ??= []).push('required');
  if (Object.keys(fields).length) return { ok: false, code: 'VALIDATION', fields };
  if (locked.length) return { ok: false, code: 'LOCKED_ITEM', items: locked };
  return { ok: true, config };
}

/** Générateur déterministe (mulberry32), comme le seed. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Empreinte FNV-1a d'une chaîne : graine stable dérivée de l'ID utilisateur. */
export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** Tirage dans une liste ; une liste vide ne consomme pas d'aléa (les avatars par défaut restent stables). */
const pick = <T>(xs: readonly T[], rnd: () => number): T | undefined => (xs.length ? xs[Math.floor(rnd() * xs.length)] : undefined);

/** Calques qu'un tirage peut laisser vides : ils restent vides une fois sur trois. */
const OPTIONAL_DRAWN: readonly AvatarLayer[] = ['face_details', 'face_brows', 'apron', 'headwear', 'held_item'];

function draw(rnd: () => number, usable: (i: AvatarItemDef) => boolean, opts: { optional: boolean }): AvatarConfigV1 {
  const layers: AvatarConfigV1['layers'] = {};
  const heads = AVATAR_ITEMS.filter((i) => i.layer === 'head' && usable(i));
  let body: AvatarItemDef | undefined;
  for (const layer of AVATAR_LAYERS) {
    // Un corps sans tête n'est tiré que si une forme de visage est disponible.
    const options = AVATAR_ITEMS.filter((i) => i.layer === layer && usable(i) && (layer !== 'body' || i.includesHead || heads.length > 0));
    const skip = (layer === 'head' && (!body || body.includesHead)) || (OPTIONAL_DRAWN.includes(layer) && (!opts.optional || rnd() < 1 / 3));
    const item = skip ? undefined : pick(options, rnd);
    if (layer === 'body') body = item;
    layers[layer] = item ? { item: item.code, palettes: item.slots.map((_, k) => pick(allowedPalettes(item, k), rnd)?.code ?? '') } : { item: null, palettes: [] };
  }
  return { v: 1, layers };
}

/**
 * Avatar attribué à l'inscription (§10.3, AVT-09) : dérivé de l'ID utilisateur, uniquement des éléments débloqués par
 * défaut, sans tablier, couvre-chef ni accessoire.
 */
export function defaultAvatar(userId: string, sprites: ReadonlySet<string> = AVATAR_SPRITES): AvatarConfigV1 {
  return draw(mulberry32(fnv1a(userId)), (i) => i.unlock.kind === 'none' && sprites.has(i.spriteKey), { optional: false });
}

/** Bouton « Aléatoire » (§10.4, AVT-06) : tirage parmi les éléments débloqués uniquement. */
export function randomAvatar(isItemUnlocked: (code: string) => boolean, rnd: () => number = Math.random, sprites: ReadonlySet<string> = AVATAR_SPRITES): AvatarConfigV1 {
  return draw(rnd, (i) => isItemUnlocked(i.code) && sprites.has(i.spriteKey), { optional: true });
}
