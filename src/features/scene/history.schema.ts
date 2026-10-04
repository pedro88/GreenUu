import { z } from 'zod';
import { TERRAIN_CELL_KINDS } from '@/lib/enums';
import { rectSchema } from './snapshot.schema';

/*
 * Instantané du plan d'un jardin (SPEC §4.2.6, TLP-01) : l'état complet du plan à la fin d'un jour de modification,
 * toutes scènes comprises. Versionné (`v`) comme les autres JSON de la base (§4.5) ; il servira au timelapse (lot 10).
 */

export const planSnapshotV1Schema = z.object({
  v: z.literal(1),
  tileSizeCm: z.number().int().positive(),
  zones: z.array(z.object({
    id: z.uuid(), name: z.string(), typeCode: z.string(), parentId: z.uuid().nullable(), sceneZoneId: z.uuid().nullable(),
    geometry: rectSchema.nullable(), archivedAt: z.string().nullable(),
  })),
  /** Cases de terrain, regroupées par scène et par type : `[x, y]` en tuiles. */
  terrain: z.array(z.object({ sceneZoneId: z.uuid().nullable(), kind: z.enum(TERRAIN_CELL_KINDS), cells: z.array(z.tuple([z.number().int(), z.number().int()])) })),
  objects: z.array(z.object({ id: z.uuid(), sceneZoneId: z.uuid().nullable(), itemCode: z.string(), x: z.number().int(), y: z.number().int(), label: z.string().nullable() })),
});
export type PlanSnapshotV1 = z.infer<typeof planSnapshotV1Schema>;
