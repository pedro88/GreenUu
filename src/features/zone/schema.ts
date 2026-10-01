import { createInsertSchema } from 'drizzle-zod';
import { optionalNumber, optionalText, uuidSchema, z } from '@/lib/zod';
import { ENVIRONMENTS, zone } from '@/server/db/schema';

export const rectGeometrySchema = z.object({
  v: z.literal(1),
  kind: z.literal('rect'),
  x: z.number().int().min(0).max(1_000_000),
  y: z.number().int().min(0).max(1_000_000),
  w: z.number().int().min(1).max(1_000_000),
  h: z.number().int().min(1).max(1_000_000),
});

const base = createInsertSchema(zone, { name: (s) => s.trim().min(1).max(80) });

const editable = {
  zoneTypeId: uuidSchema,
  environment: z.preprocess((v) => (v === '' ? null : v), z.enum(ENVIRONMENTS).nullable().default(null)),
  lengthCm: optionalNumber(z.number().int().min(1).max(1_000_000)),
  widthCm: optionalNumber(z.number().int().min(1).max(1_000_000)),
  surfaceM2Manual: optionalNumber(z.number().positive().max(10_000_000)),
  geometry: rectGeometrySchema.nullable().default(null),
  hasInterior: z.boolean().default(false),
  notes: optionalText(2000),
};

export const zoneCreateSchema = base.pick({ name: true }).extend({
  gardenId: uuidSchema,
  parentId: z.preprocess((v) => (v === '' ? null : v), uuidSchema.nullable().default(null)),
  ...editable,
});
export type ZoneCreateInput = z.output<typeof zoneCreateSchema>;

export const zoneUpdateSchema = base.pick({ name: true }).extend({ gardenId: uuidSchema, zoneId: uuidSchema, ...editable });
export type ZoneUpdateInput = z.output<typeof zoneUpdateSchema>;

export const zoneMoveSchema = z.object({
  gardenId: uuidSchema,
  zoneId: uuidSchema,
  parentId: z.preprocess((v) => (v === '' ? null : v), uuidSchema.nullable()),
});

export const zoneRefSchema = z.object({ gardenId: uuidSchema, zoneId: uuidSchema });

export const zoneTypeCreateSchema = z.object({
  gardenId: uuidSchema,
  label: z.string().trim().min(2).max(40),
  canHostCultures: z.boolean().default(true),
  hasInteriorDefault: z.boolean().default(false),
});

export const zoneTypeArchiveSchema = z.object({ gardenId: uuidSchema, zoneTypeId: uuidSchema });

export const zoneRestrictSchema = z.object({
  gardenId: uuidSchema,
  zoneId: uuidSchema,
  restrictions: z.array(z.object({ groupId: uuidSchema, level: z.enum(['edit', 'contribute']) })).max(20),
});
