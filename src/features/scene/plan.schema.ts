import { z } from 'zod';
import { TERRAIN_CELL_KINDS } from '@/lib/enums';
import { uuidSchema } from '@/lib/zod';
import { rectSchema } from './snapshot.schema';
import { TILE_SIZES_CM } from './grid.pure';
import { MAX_CELL_COORD, MAX_CELLS_PER_COMMAND } from './terrain.pure';

/*
 * Commandes de l'éditeur de plan (SPEC §9.7). Chaque geste produit une commande, appliquée d'abord au store local puis
 * envoyée par lots. Une zone ou un élément créé dans le lot est désigné par un identifiant client `tmp:…` jusqu'à sa
 * confirmation par le serveur. Les commandes de déco exigent `decor:place` (lot 8) ; le terrain est peint par cases (lot 9).
 */

export const TMP_PREFIX = 'tmp:';
const tmpId = z.string().regex(/^tmp:[\w-]{1,40}$/);
/**
 * Géométrie d'entrée : mêmes bornes que le formulaire de zone (`zone/schema.ts`), en centimètres, origine de la scène en
 * (0, 0). Le schéma de l'instantané, qui décrit une sortie, n'en impose pas (audit lot 7, M5).
 */
const cm = z.number().int().min(0).max(1_000_000);
const inputRect = rectSchema.extend({ x: cm, y: cm, w: cm.min(1), h: cm.min(1) });

/** Zone existante (UUID) ou créée plus tôt dans le même lot (`tmp:…`). */
const zoneRef = z.union([uuidSchema, tmpId]);
/** Cases de terrain `[x, y]`, en tuiles (PNT-07 : au plus 2 500 par commande). */
const coord = z.number().int().min(0).max(MAX_CELL_COORD);
const cells = z.array(z.tuple([coord, coord])).min(1).max(MAX_CELLS_PER_COMMAND);

export const planCommandSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('createZone'), clientId: tmpId, name: z.string().trim().min(1).max(80), zoneTypeId: uuidSchema, parentId: zoneRef.nullable(), geometry: inputRect }),
  z.object({ op: z.literal('resizeZone'), zoneId: zoneRef, geometry: inputRect }),
  z.object({ op: z.literal('moveZone'), zoneId: zoneRef, geometry: inputRect }),
  z.object({ op: z.literal('archiveZone'), zoneId: zoneRef, finishActiveCultures: z.boolean().default(false) }),
  z.object({ op: z.literal('paintTerrain'), kind: z.enum(TERRAIN_CELL_KINDS), cells }),
  z.object({ op: z.literal('eraseTerrain'), cells }),
  z.object({ op: z.literal('setScale'), tileSizeCm: z.literal(TILE_SIZES_CM) }),
  /** Pied de l'objet (bas au centre), en centimètres. */
  z.object({ op: z.literal('placeDecor'), clientId: tmpId, itemCode: z.string().regex(/^[a-z0-9_]{1,40}$/), x: cm, y: cm, label: z.string().trim().min(1).max(40).nullable().default(null) }),
  z.object({ op: z.literal('moveDecor'), decorId: z.union([uuidSchema, tmpId]), x: cm, y: cm }),
  /** DEC-03 : retirer un objet déclaré comme pratique propose de retirer aussi la pratique. */
  z.object({ op: z.literal('removeDecor'), decorId: z.union([uuidSchema, tmpId]), removePractice: z.boolean().default(false) }),
]);
export type PlanCommand = z.infer<typeof planCommandSchema>;
export type PlanCommandInput = z.input<typeof planCommandSchema>;

export const applyPlanSchema = z.object({
  gardenId: uuidSchema,
  sceneZoneId: uuidSchema.nullable(),
  baseVersion: z.number().int().min(0),
  commands: z.array(planCommandSchema).min(1).max(200),
});
export type ApplyPlanInput = z.infer<typeof applyPlanSchema>;
