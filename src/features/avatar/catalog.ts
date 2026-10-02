import { AVATAR_BUILDS, AVATAR_HEIGHTS, type AvatarLayer, type PaletteSlot } from '@/lib/enums';
import type { UnlockConditionV1 } from '../progression/unlock.pure';

/*
 * Catalogue d'avatar (SPEC §10), défini en code et chargé en base avec le référentiel (`loadCatalogs`). Le client le lit
 * aussi pour composer les calques sans requête. Les clés de sprites suivent les frames livrées dans l'atlas
 * (`avatar/<clé>-<direction>-<pose>.png`). Aucun élément n'est restreint à un genre : silhouettes neutres (§10.2).
 *
 * Tout le catalogue actuel est disponible dès le départ (condition `none`) ; le mécanisme de déblocage reste en place
 * pour de futurs contenus exclusifs. Un élément n'est proposé que si ses sprites sont livrés (`AVATAR_SPRITES`).
 */

export type AvatarItemDef = {
  code: string;
  layer: AvatarLayer;
  spriteKey: string;
  /** Types d'emplacement de couleur, dans l'ordre des palettes de la configuration. */
  slots: PaletteSlot[];
  unlock: UnlockConditionV1;
  /** Palettes autorisées ; à défaut, toutes celles du type d'emplacement. */
  palettes?: string[];
  /** Corps : gabarit (`<corpulence>-<taille>` des noms de sprites) et présence de la tête dans le sprite. */
  gabarit?: string;
  includesHead?: boolean;
};

export type PaletteDef = { code: string; slot: PaletteSlot; ramp: [string, string, string, string] };

const none: UnlockConditionV1 = { v: 1, kind: 'none' };

/** Corpulence et taille → mots des noms de sprites (`corps-<corpulence>-<taille>`). */
export const BUILD_WORDS: Record<(typeof AVATAR_BUILDS)[number], string> = { slim: 'mince', average: 'moyenne', round: 'ronde' };
export const HEIGHT_WORDS: Record<(typeof AVATAR_HEIGHTS)[number], string> = { short: 'petite', medium: 'moyenne', tall: 'grande' };
/** Gabarit des sprites livrés jusqu'ici (`corps-base`) : tous les décalages sont relatifs à lui. */
export const BASE_GABARIT = 'moyenne-moyenne';

const silhouettes: AvatarItemDef[] = AVATAR_BUILDS.flatMap((b) => AVATAR_HEIGHTS.map((h) => {
  const gabarit = `${BUILD_WORDS[b]}-${HEIGHT_WORDS[h]}`;
  return { code: `body_${b}_${h}`, layer: 'body' as const, spriteKey: `corps-${gabarit}`, slots: ['skin' as const], unlock: none, gabarit, includesHead: false };
}));

export const AVATAR_ITEMS: readonly AvatarItemDef[] = [
  { code: 'shadow', layer: 'shadow', spriteKey: 'ombre-base', slots: [], unlock: none },
  // Corps d'origine, tête comprise ; les silhouettes sans tête se combinent avec une forme de visage.
  { code: 'body', layer: 'body', spriteKey: 'corps-base', slots: ['skin'], unlock: none, gabarit: BASE_GABARIT, includesHead: true },
  ...silhouettes,
  // Formes de visage : recolorées avec la peau du corps (calque lié, sans palette propre).
  { code: 'head_round', layer: 'head', spriteKey: 'tete-ronde', slots: [], unlock: none },
  { code: 'head_oval', layer: 'head', spriteKey: 'tete-ovale', slots: [], unlock: none },
  { code: 'head_square', layer: 'head', spriteKey: 'tete-carree', slots: [], unlock: none },
  { code: 'head_heart', layer: 'head', spriteKey: 'tete-coeur', slots: [], unlock: none },
  { code: 'head_long', layer: 'head', spriteKey: 'tete-longue', slots: [], unlock: none },
  // Signes de l'âge, sur la peau du corps.
  { code: 'age_child', layer: 'face_details', spriteKey: 'age-enfant', slots: [], unlock: none },
  { code: 'age_mature', layer: 'face_details', spriteKey: 'age-mur', slots: [], unlock: none },
  { code: 'age_senior', layer: 'face_details', spriteKey: 'age-aine', slots: [], unlock: none },
  { code: 'eyes', layer: 'face_eyes', spriteKey: 'yeux-base', slots: [], unlock: none },
  { code: 'eyes_round', layer: 'face_eyes', spriteKey: 'yeux-ronds', slots: ['eyes'], unlock: none },
  { code: 'eyes_almond', layer: 'face_eyes', spriteKey: 'yeux-amande', slots: ['eyes'], unlock: none },
  { code: 'eyes_narrow', layer: 'face_eyes', spriteKey: 'yeux-fins', slots: ['eyes'], unlock: none },
  { code: 'eyes_wide', layer: 'face_eyes', spriteKey: 'yeux-grands', slots: ['eyes'], unlock: none },
  { code: 'eyes_lashes', layer: 'face_eyes', spriteKey: 'yeux-cils', slots: ['eyes'], unlock: none },
  { code: 'eyes_sleepy', layer: 'face_eyes', spriteKey: 'yeux-mi-clos', slots: ['eyes'], unlock: none },
  { code: 'brows_thin', layer: 'face_brows', spriteKey: 'sourcils-fins', slots: ['hair'], unlock: none },
  { code: 'brows_thick', layer: 'face_brows', spriteKey: 'sourcils-epais', slots: ['hair'], unlock: none },
  // Un seul choix « cheveux » pour l'utilisateur (§10.1) : les assets V1 n'ont pas de partie arrière séparée.
  { code: 'hair_short', layer: 'hair_front', spriteKey: 'cheveux-court', slots: ['hair'], unlock: none },
  { code: 'hair_long', layer: 'hair_front', spriteKey: 'cheveux-long', slots: ['hair'], unlock: none },
  { code: 'hair_curly', layer: 'hair_front', spriteKey: 'cheveux-boucle', slots: ['hair'], unlock: none },
  { code: 'hair_bun', layer: 'hair_front', spriteKey: 'cheveux-chignon', slots: ['hair'], unlock: none },
  { code: 'top_tshirt', layer: 'top', spriteKey: 'haut-tshirt', slots: ['cloth'], unlock: none },
  { code: 'top_sweater', layer: 'top', spriteKey: 'haut-pull', slots: ['cloth'], unlock: none },
  { code: 'bottom_trousers', layer: 'bottom', spriteKey: 'bas-pantalon', slots: ['cloth'], unlock: none },
  { code: 'bottom_shorts', layer: 'bottom', spriteKey: 'bas-short', slots: ['cloth'], unlock: none },
  { code: 'apron_gardener', layer: 'apron', spriteKey: 'tablier-jardinier', slots: ['cloth'], unlock: none },
  { code: 'shoes_sneakers', layer: 'shoes', spriteKey: 'chaussures-baskets', slots: ['cloth'], unlock: none },
  { code: 'shoes_boots', layer: 'shoes', spriteKey: 'chaussures-bottes', slots: ['material'], unlock: none, palettes: ['rubber_green', 'leather', 'charcoal_rubber'] },
  { code: 'hat_beanie', layer: 'headwear', spriteKey: 'couvre-chef-bonnet', slots: ['cloth'], unlock: none },
  { code: 'hat_bucket', layer: 'headwear', spriteKey: 'couvre-chef-bob', slots: ['cloth'], unlock: none },
  { code: 'hat_straw', layer: 'headwear', spriteKey: 'couvre-chef-chapeau-paille', slots: ['material'], unlock: none, palettes: ['straw', 'wood', 'leather'] },
  { code: 'held_watering_can', layer: 'held_item', spriteKey: 'accessoire-arrosoir', slots: ['material'], unlock: none, palettes: ['steel', 'terracotta', 'rubber_green'] },
  { code: 'held_basket', layer: 'held_item', spriteKey: 'accessoire-panier', slots: ['material'], unlock: none, palettes: ['straw', 'wood'] },
  { code: 'held_spade', layer: 'held_item', spriteKey: 'accessoire-beche', slots: ['material'], unlock: none, palettes: ['wood', 'steel'] },
];

/** Rampes de 4 couleurs, de la plus claire à la plus sombre. 14 teintes de peau couvrent toute l'échelle (AVT-08). */
export const PALETTES: readonly PaletteDef[] = [
  { code: 'skin_01', slot: 'skin', ramp: ['#ffe9dc', '#f6d0bb', '#e3b29a', '#c48f78'] },
  { code: 'skin_02', slot: 'skin', ramp: ['#fbe0cb', '#f0c4a4', '#d9a382', '#b98264'] },
  { code: 'skin_03', slot: 'skin', ramp: ['#f6d6b8', '#e8bb92', '#d09d72', '#ad7c55'] },
  { code: 'skin_04', slot: 'skin', ramp: ['#f2cfa6', '#e1b07f', '#c79260', '#a47146'] },
  { code: 'skin_05', slot: 'skin', ramp: ['#ebc29a', '#d8a473', '#bc8654', '#98673b'] },
  { code: 'skin_06', slot: 'skin', ramp: ['#e2b48a', '#cb9562', '#ad7746', '#8a5a31'] },
  { code: 'skin_07', slot: 'skin', ramp: ['#d6a57b', '#bd8656', '#9e6a3e', '#7c4f2b'] },
  { code: 'skin_08', slot: 'skin', ramp: ['#c8946b', '#ad774a', '#8e5d35', '#6d4425'] },
  { code: 'skin_09', slot: 'skin', ramp: ['#b8835c', '#9b683f', '#7d502d', '#5e3a20'] },
  { code: 'skin_10', slot: 'skin', ramp: ['#a5714f', '#895a36', '#6c4427', '#50301b'] },
  { code: 'skin_11', slot: 'skin', ramp: ['#916146', '#764c30', '#5b3922', '#422817'] },
  { code: 'skin_12', slot: 'skin', ramp: ['#7d523c', '#634029', '#4b2f1e', '#352114'] },
  { code: 'skin_13', slot: 'skin', ramp: ['#6a4433', '#523322', '#3d2619', '#2a1a11'] },
  { code: 'skin_14', slot: 'skin', ramp: ['#56372a', '#42291d', '#311e15', '#21140e'] },
  { code: 'hair_black', slot: 'hair', ramp: ['#5a5560', '#3a3640', '#25222a', '#141217'] },
  { code: 'hair_dark_brown', slot: 'hair', ramp: ['#7a5a45', '#5a3f2f', '#3f2b20', '#281b14'] },
  { code: 'hair_brown', slot: 'hair', ramp: ['#a37a55', '#82593a', '#623f27', '#432a19'] },
  { code: 'hair_auburn', slot: 'hair', ramp: ['#c27a4f', '#9e5634', '#7a3c23', '#542716'] },
  { code: 'hair_copper', slot: 'hair', ramp: ['#e89a5e', '#c9733b', '#a35427', '#773a19'] },
  { code: 'hair_blond', slot: 'hair', ramp: ['#f6e0a0', '#e2c072', '#c39c4e', '#9a7634'] },
  { code: 'hair_ash', slot: 'hair', ramp: ['#d8cfb8', '#b8ad94', '#948a72', '#6e6653'] },
  { code: 'hair_grey', slot: 'hair', ramp: ['#d6d6d6', '#acacac', '#828282', '#5c5c5c'] },
  { code: 'hair_white', slot: 'hair', ramp: ['#ffffff', '#e8e8ee', '#c8c8d2', '#a2a2b0'] },
  { code: 'hair_teal', slot: 'hair', ramp: ['#7fd6c8', '#4fb0a2', '#36877c', '#235e56'] },
  { code: 'hair_violet', slot: 'hair', ramp: ['#c8a2e8', '#a07ac8', '#7a56a2', '#543a72'] },
  { code: 'eye_brown', slot: 'eyes', ramp: ['#a8754f', '#7a4f31', '#56351f', '#3a2314'] },
  { code: 'eye_hazel', slot: 'eyes', ramp: ['#c9a25c', '#9a7a3e', '#6f5a2b', '#4a3c1c'] },
  { code: 'eye_green', slot: 'eyes', ramp: ['#9fcf8a', '#6f9f5a', '#4c7a3e', '#33532a'] },
  { code: 'eye_blue', slot: 'eyes', ramp: ['#a8d0f0', '#6fa3d0', '#4a78a8', '#2f527a'] },
  { code: 'eye_grey', slot: 'eyes', ramp: ['#cfd6dc', '#9aa4ad', '#6e7880', '#4a5258'] },
  { code: 'eye_black', slot: 'eyes', ramp: ['#6a6070', '#463e4a', '#2c262f', '#1a161c'] },
  { code: 'eye_amber', slot: 'eyes', ramp: ['#f2c46a', '#d0973a', '#a06c22', '#704914'] },
  { code: 'leaf', slot: 'cloth', ramp: ['#b9e08a', '#8fbf63', '#6a9a45', '#4a7030'] },
  { code: 'moss', slot: 'cloth', ramp: ['#a9b77a', '#838f55', '#626b3b', '#434a28'] },
  { code: 'sky', slot: 'cloth', ramp: ['#bfe3f4', '#8cc5e3', '#5f9fc4', '#3f789c'] },
  { code: 'navy', slot: 'cloth', ramp: ['#8a9cc8', '#5d6fa3', '#3f4f7d', '#283456'] },
  { code: 'plum', slot: 'cloth', ramp: ['#d4a6c8', '#ad7aa3', '#86587e', '#5e3b58'] },
  { code: 'rose', slot: 'cloth', ramp: ['#f8c8d0', '#e8a0ae', '#c97a8a', '#9e5666'] },
  { code: 'brick', slot: 'cloth', ramp: ['#e89a7e', '#d4573b', '#a83f2a', '#7a2c1d'] },
  { code: 'mustard', slot: 'cloth', ramp: ['#f6dc8a', '#f2c14e', '#c99a2e', '#94701d'] },
  { code: 'sand', slot: 'cloth', ramp: ['#efe2c4', '#d9c6a0', '#b8a37c', '#8d7c5b'] },
  { code: 'charcoal', slot: 'cloth', ramp: ['#8a8590', '#625d68', '#433f48', '#2a272e'] },
  { code: 'cream', slot: 'cloth', ramp: ['#fffaf0', '#f1e9d8', '#d9cfba', '#b4a990'] },
  { code: 'teal', slot: 'cloth', ramp: ['#9ed8d0', '#62b3a8', '#3f8a80', '#29615a'] },
  { code: 'straw', slot: 'material', ramp: ['#f8e6a6', '#e6c76e', '#c7a14a', '#9a7a32'] },
  { code: 'wood', slot: 'material', ramp: ['#d6a878', '#b08050', '#875e36', '#5e4024'] },
  { code: 'steel', slot: 'material', ramp: ['#dfe6ea', '#b4c0c8', '#87959f', '#5c6870'] },
  { code: 'terracotta', slot: 'material', ramp: ['#f0b48e', '#d88a5e', '#b4683f', '#86492a'] },
  { code: 'rubber_green', slot: 'material', ramp: ['#9fcf6a', '#6f9a4f', '#4f7036', '#344b24'] },
  { code: 'charcoal_rubber', slot: 'material', ramp: ['#7d7884', '#57525d', '#3a363f', '#232026'] },
  { code: 'leather', slot: 'material', ramp: ['#c89a6e', '#9e7048', '#76502f', '#50351e'] },
];

export const AVATAR_ITEM_BY_CODE: ReadonlyMap<string, AvatarItemDef> = new Map(AVATAR_ITEMS.map((i) => [i.code, i]));
export const PALETTE_BY_CODE: ReadonlyMap<string, PaletteDef> = new Map(PALETTES.map((p) => [p.code, p]));

/** Palettes autorisées pour un emplacement d'un élément (§10.3, `avatar_item_palette`). */
export function allowedPalettes(item: AvatarItemDef, slotIndex: number): PaletteDef[] {
  const slot = item.slots[slotIndex];
  if (!slot) return [];
  return PALETTES.filter((p) => p.slot === slot && (!item.palettes || item.palettes.includes(p.code)));
}

/**
 * Catégories de l'éditeur (§10.4). Chaque onglet regroupe une ou plusieurs sections, une par calque : « Visage » porte
 * la forme, les yeux, les sourcils et l'âge. « Cheveux » couvre les deux calques de cheveux.
 */
export const AVATAR_TABS = [
  { key: 'body', sections: ['body'] }, { key: 'face', sections: ['head', 'face_eyes', 'face_brows', 'face_details'] }, { key: 'hair', sections: ['hair_front'] },
  { key: 'top', sections: ['top'] }, { key: 'bottom', sections: ['bottom'] }, { key: 'apron', sections: ['apron'] }, { key: 'shoes', sections: ['shoes'] },
  { key: 'headwear', sections: ['headwear'] }, { key: 'held', sections: ['held_item'] },
] as const satisfies readonly { key: string; sections: readonly AvatarLayer[] }[];
