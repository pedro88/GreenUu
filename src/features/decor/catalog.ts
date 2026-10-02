import type { UnlockConditionV1 } from '../progression/unlock.pure';

/*
 * Catalogue des objets de déco (SPEC §4.2.6, SPRITES.md §6), défini en code et chargé en base avec le référentiel.
 * Un objet ★ porte le code de la pratique réelle qu'il peut déclarer (DEC-03). Le sprite est la frame `deco/<clé>.png`.
 */

export type DecorItemDef = { code: string; spriteKey: string; w: number; h: number; practice?: string; unlock: UnlockConditionV1; labelled?: boolean };

const none: UnlockConditionV1 = { v: 1, kind: 'none' };
const level = (min: number): UnlockConditionV1 => ({ v: 1, kind: 'level', min });

export const DECOR_ITEMS: readonly DecorItemDef[] = [
  { code: 'insect_hotel', spriteKey: 'hotel-insectes', w: 1, h: 1, practice: 'biodiversity_insect_hotel', unlock: none },
  { code: 'birdhouse', spriteKey: 'nichoir', w: 1, h: 1, practice: 'biodiversity_birdhouse', unlock: none },
  { code: 'bench', spriteKey: 'banc', w: 1, h: 1, unlock: none },
  { code: 'scarecrow', spriteKey: 'epouvantail', w: 1, h: 1, unlock: none },
  { code: 'watering_can', spriteKey: 'arrosoir', w: 1, h: 1, unlock: none },
  { code: 'wheelbarrow', spriteKey: 'brouette', w: 1, h: 1, unlock: none },
  { code: 'sign', spriteKey: 'panneau', w: 1, h: 1, unlock: none, labelled: true },
  { code: 'flower_pots_1', spriteKey: 'pot-fleurs-1', w: 1, h: 1, unlock: none },
  { code: 'flower_pots_2', spriteKey: 'pot-fleurs-2', w: 1, h: 1, unlock: level(2) },
  { code: 'flower_pots_3', spriteKey: 'pot-fleurs-3', w: 1, h: 1, unlock: { v: 1, kind: 'skill', skill: 'flowers', min: 2 } },
  { code: 'rockery_1', spriteKey: 'rocaille-1', w: 1, h: 1, unlock: none },
  { code: 'rockery_2', spriteKey: 'rocaille-2', w: 1, h: 1, unlock: level(3) },
  { code: 'rockery_3', spriteKey: 'rocaille-3', w: 1, h: 1, unlock: level(4) },
  { code: 'bird_feeder', spriteKey: 'mangeoire', w: 1, h: 1, unlock: level(2) },
  { code: 'bird_bath', spriteKey: 'bain-oiseaux', w: 1, h: 1, unlock: level(2) },
  { code: 'lantern', spriteKey: 'lanterne-eteinte', w: 1, h: 1, unlock: level(3) },
  { code: 'string_lights', spriteKey: 'guirlande', w: 2, h: 1, unlock: { v: 1, kind: 'season_active', season: 'winter' } },
  { code: 'table_chairs', spriteKey: 'table-chaises', w: 2, h: 1, unlock: level(3) },
  { code: 'pond', spriteKey: 'mare', w: 2, h: 2, practice: 'biodiversity_pond', unlock: level(4) },
  { code: 'beehive', spriteKey: 'ruche', w: 1, h: 1, unlock: { v: 1, kind: 'achievement', code: 'collective_active' } },
  { code: 'log_pile', spriteKey: 'tas-bois', w: 1, h: 1, unlock: { v: 1, kind: 'skill', skill: 'compost', min: 2 } },
  { code: 'wind_chime', spriteKey: 'carillon', w: 1, h: 1, unlock: { v: 1, kind: 'season_active', season: 'spring' } },
  { code: 'weathervane', spriteKey: 'girouette', w: 1, h: 1, unlock: { v: 1, kind: 'season_active', season: 'autumn' } },
  { code: 'arch', spriteKey: 'arche', w: 2, h: 2, unlock: level(5) },
  { code: 'hammock', spriteKey: 'hamac', w: 2, h: 1, unlock: level(5) },
  { code: 'statue', spriteKey: 'statue', w: 1, h: 1, unlock: level(5) },
];

export const DECOR_BY_CODE: ReadonlyMap<string, DecorItemDef> = new Map(DECOR_ITEMS.map((d) => [d.code, d]));

export const decorFrame = (spriteKey: string) => `deco/${spriteKey}.png`;
