import { readExport } from '@/features/privacy/service';
import { DomainError } from '@/lib/errors';
import { uuidSchema } from '@/lib/zod';
import { getSessionUser } from '@/server/auth/session';
import { appClock } from '@/server/clock';
import { db } from '@/server/db/client';
import { storage } from '@/server/storage/storage';

/** Téléchargement de l'export RGPD : son auteur seul, connecté, avant expiration (§11.4) ; sinon 404. */
export async function GET(_req: Request, ctx: RouteContext<'/app/parametres/confidentialite/export/[exportId]'>) {
  const { exportId } = await ctx.params;
  const u = await getSessionUser();
  if (!u || !uuidSchema.safeParse(exportId).success) return new Response(null, { status: 404 });
  try {
    const data = await readExport(db(), u.id, exportId, storage(), appClock().now());
    return new Response(new Blob([new Uint8Array(data)], { type: 'application/zip' }), {
      headers: { 'content-type': 'application/zip', 'content-disposition': 'attachment; filename="greenu-export.zip"', 'cache-control': 'private, no-store' },
    });
  } catch (e) {
    if (e instanceof DomainError && e.code === 'NOT_FOUND') return new Response(null, { status: 404 });
    throw e;
  }
}
