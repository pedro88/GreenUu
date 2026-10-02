'use server';

import type { ActionResult } from '@/lib/errors';
import { z } from '@/lib/zod';
import { defineAction } from '@/server/action';
import { appClock } from '@/server/clock';
import { db } from '@/server/db/client';
import { requestDeletion, requestExport, restoreAccount } from './service';

export const requestExportAction = defineAction({ name: 'privacy.export', input: z.object({}), handler: (ctx) => requestExport(ctx) });

export const requestDeletionAction = defineAction({
  name: 'privacy.delete', skipRevalidation: true, input: z.object({ confirmTransferToMember: z.boolean().default(false), confirm: z.literal(true) }),
  handler: (ctx, input) => requestDeletion(ctx, { confirmTransferToMember: input.confirmTransferToMember }),
});

/** PRV-09 : rétablissement sans session (le compte est désactivé), sur confirmation, par le jeton signé reçu par e-mail. */
export async function restoreAccountAction(raw: unknown): Promise<ActionResult<{ restored: true }>> {
  const parsed = z.object({ token: z.string().min(1).max(512) }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: { code: 'NOT_FOUND', message: 'restoreInvalid' } };
  try {
    await db().transaction((tx) => restoreAccount(tx, parsed.data.token, appClock().now()));
    return { ok: true, data: { restored: true } };
  } catch {
    return { ok: false, error: { code: 'NOT_FOUND', message: 'restoreInvalid' } };
  }
}
