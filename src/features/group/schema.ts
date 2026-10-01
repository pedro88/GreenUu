import { uuidSchema, z } from '@/lib/zod';

export const GROUP_COLORS = ['green', 'yellow', 'orange', 'red', 'purple', 'blue', 'brown', 'grey'] as const;

export const groupCreateSchema = z.object({
  gardenId: uuidSchema,
  name: z.string().trim().min(2).max(40),
  color: z.enum(GROUP_COLORS).default('green'),
  memberIds: z.array(uuidSchema).max(200).default([]),
});
export const groupUpdateSchema = groupCreateSchema.extend({ groupId: uuidSchema });
export const groupRefSchema = z.object({ gardenId: uuidSchema, groupId: uuidSchema });
