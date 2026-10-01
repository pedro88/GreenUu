import { uploadPhoto } from '@/features/journal/service';
import { DomainError } from '@/lib/errors';
import { uuidSchema } from '@/lib/zod';
import { getSessionUser } from '@/server/auth/session';
import { loadScope } from '@/server/authz/scope';
import { db } from '@/server/db/client';
import { storage } from '@/server/storage/storage';

/** POST multipart (file, gardenId) : téléverse une photo « en attente » (RG-JRN-03). */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: 'unauthenticated' }, { status: 401 });
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  const gardenId = uuidSchema.safeParse(form?.get('gardenId'));
  if (!(file instanceof File) || !gardenId.success) return Response.json({ error: 'validation' }, { status: 400 });
  const scope = await loadScope(db(), user.id, gardenId.data);
  if (!scope) return Response.json({ error: 'forbidden' }, { status: 403 });
  const data = new Uint8Array(await file.arrayBuffer());
  try {
    const result = await db().transaction((tx) => uploadPhoto(tx, scope, user.id, data, storage()));
    return Response.json(result, { status: 201 });
  } catch (e) {
    if (e instanceof DomainError) return Response.json({ error: e.message, fieldErrors: e.fieldErrors }, { status: e.code === 'FORBIDDEN' ? 403 : 400 });
    throw e;
  }
}
