import { z } from 'zod';
import { TERRAIN_CELL_KINDS } from '@/lib/enums';
import { SCENE_ACTIONS } from './avatar-action.pure';
import { VISUAL_PHASES, VISUAL_STATES } from './phase.pure';

/* Instantané de scène (SPEC §9.1) : produit par le serveur, validé par Zod, passé au client qui ne lit jamais la base. */

export const rectSchema = z.object({ v: z.literal(1), kind: z.literal('rect'), x: z.number().int(), y: z.number().int(), w: z.number().int().positive(), h: z.number().int().positive() });

export const sceneZoneSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  typeCode: z.string(),
  parentId: z.uuid().nullable(),
  depth: z.number().int(),
  geometry: rectSchema.nullable(),
  hasInterior: z.boolean(),
  canHostCultures: z.boolean(),
  /** Libellé lisible de la zone, pour la couche accessible (« Planche 2, Potager »). */
  label: z.string(),
});

export const sceneCultureSchema = z.object({
  id: z.uuid(),
  zoneId: z.uuid(),
  label: z.string(),
  /** Clés de sprite dans l'ordre du repli (§9.2) : variété, espèce, famille. */
  spriteKeys: z.array(z.string()),
  phase: z.enum(VISUAL_PHASES),
  progress: z.number().min(0).max(1),
  states: z.array(z.enum(VISUAL_STATES)),
  /** Position du pied dans la scène, en centimètres ; null si aucune zone ancêtre n'est placée (« À placer »). */
  position: z.object({ x: z.number(), y: z.number() }).nullable(),
});

/** Case de terrain peinte (§4.2.6), en tuiles de l'échelle courante. */
export const sceneTerrainSchema = z.object({ x: z.number().int().min(0), y: z.number().int().min(0), kind: z.enum(TERRAIN_CELL_KINDS) });

/** Objet de déco : pied (bas au centre) en centimètres, emprise en tuiles. */
export const sceneDecorSchema = z.object({
  id: z.string(),
  itemCode: z.string(),
  spriteKey: z.string(),
  w: z.number().int().positive(),
  h: z.number().int().positive(),
  x: z.number().int(),
  y: z.number().int(),
  label: z.string().nullable(),
  /** Objet ★ : code de la pratique qu'il peut déclarer, et s'il l'a déclarée (DEC-03). */
  practiceCode: z.string().nullable(),
  practiceDeclared: z.boolean(),
});

/**
 * Membre actif dans les 24 dernières heures (ou l'utilisateur courant), près de la zone de sa dernière action (§9.5,
 * COL-04) ; il rejoue cette action si elle a moins de 24 h (LIV-01, LIV-08).
 */
export const sceneAvatarSchema = z.object({
  userId: z.uuid(),
  pseudo: z.string(),
  config: z.object({ v: z.literal(1), layers: z.record(z.string(), z.object({ item: z.string().nullable(), palettes: z.array(z.string()) })) }),
  configHash: z.string(),
  zoneId: z.uuid(),
  position: z.object({ x: z.number(), y: z.number() }),
  /** Emprise de la zone (ou de l'ancêtre placé) où l'avatar se déplace (LIV-09), en centimètres. */
  area: z.object({ x: z.number(), y: z.number(), w: z.number().positive(), h: z.number().positive() }),
  action: z.enum(SCENE_ACTIONS).nullable(),
  /** Ancienneté de la dernière action en minutes, pour la liste textuelle (« il y a 1 h », LIV-06). */
  ageMinutes: z.number().int().min(0),
  isViewer: z.boolean(),
});

export const sceneSnapshotSchema = z.object({
  gardenId: z.uuid(),
  gardenName: z.string(),
  /** Scène affichée : null = extérieur, sinon l'intérieur d'une zone `has_interior`. */
  sceneZoneId: z.uuid().nullable(),
  /** Fil d'Ariane, de l'extérieur à la scène courante. */
  breadcrumb: z.array(z.object({ zoneId: z.uuid().nullable(), name: z.string() })),
  planVersion: z.number().int(),
  tileSizeCm: z.number().int().positive(),
  bounds: z.object({ w: z.number().int().positive(), h: z.number().int().positive() }),
  zones: z.array(sceneZoneSchema),
  terrain: z.array(sceneTerrainSchema),
  cultures: z.array(sceneCultureSchema),
  decor: z.array(sceneDecorSchema),
  avatars: z.array(sceneAvatarSchema),
  ambient: z.object({ period: z.enum(['night', 'dawn', 'day', 'dusk']), season: z.enum(['spring', 'summer', 'autumn', 'winter']), tint: z.number().int(), alpha: z.number() }),
  viewer: z.object({ canEditPlan: z.boolean(), canPlaceDecor: z.boolean(), canDeclarePractice: z.boolean(), reducedMotion: z.boolean() }),
});

export type SceneSnapshot = z.infer<typeof sceneSnapshotSchema>;
export type SceneZone = z.infer<typeof sceneZoneSchema>;
export type SceneCulture = z.infer<typeof sceneCultureSchema>;
export type SceneTerrain = z.infer<typeof sceneTerrainSchema>;
export type SceneDecor = z.infer<typeof sceneDecorSchema>;
export type SceneAvatar = z.infer<typeof sceneAvatarSchema>;
