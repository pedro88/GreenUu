import { readAttachment } from '@/features/journal/service';
import { uuidSchema } from '@/lib/zod';
import { getSessionUser } from '@/server/auth/session';
import { loadScope } from '@/server/authz/scope';
import { db } from '@/server/db/client';
import { storage } from '@/server/storage/storage';

/** Photo d'un jardin : servie uniquement à ses membres actifs, sinon 404 (AUTHZ-08). */
export async function GET(_req: Request, ctx: RouteContext<'/api/files/[fileId]'>) {
  const { fileId } = await ctx.params;
  const user = await getSessionUser();
  if (!user || !uuidSchema.safeParse(fileId).success) return new Response(null, { status: 404 });
  const file = await readAttachment(db(), (gardenId) => loadScope(db(), user.id, gardenId), fileId, storage());
  if (!file) return new Response(null, { status: 404 });
  return new Response(new Blob([new Uint8Array(file.data)], { type: file.mime }), {
    headers: { 'Content-Type': file.mime, 'Cache-Control': 'private, max-age=86400, immutable', 'X-Content-Type-Options': 'nosniff' },
  });
}
