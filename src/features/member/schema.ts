import { uuidSchema, z } from '@/lib/zod';
import { NON_OWNER_ROLES } from '@/server/db/schema';

export const inviteSchema = z.object({
  gardenId: uuidSchema,
  email: z.string().trim().toLowerCase().pipe(z.email()),
  role: z.enum(NON_OWNER_ROLES),
  groupIds: z.array(uuidSchema).max(20).default([]),
});
export type InviteInput = z.output<typeof inviteSchema>;

export const invitationRefSchema = z.object({ gardenId: uuidSchema, invitationId: uuidSchema });
export const invitationTokenSchema = z.object({ token: z.string().min(20).max(100) });
export const memberRefSchema = z.object({ gardenId: uuidSchema, memberId: uuidSchema });
export const changeRoleSchema = memberRefSchema.extend({ role: z.enum(NON_OWNER_ROLES) });
