/**
 * Compression côté client (RG-JRN-03, NFR-02) : redimensionnement à 1600 px et ré-encodage JPEG.
 * Le ré-encodage par canvas supprime toutes les métadonnées EXIF, dont la position GPS (JRN-02).
 */
export const MAX_PHOTO_SIDE = 1600;

export async function compressImage(file: File, maxSide = MAX_PHOTO_SIDE, quality = 0.82): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas indisponible');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Encodage impossible'))), 'image/jpeg', quality));
}

/** Téléverse une photo compressée et renvoie l'identifiant de la pièce jointe « en attente ». */
export async function uploadPhoto(gardenId: string, file: File): Promise<{ attachmentId: string }> {
  const blob = await compressImage(file);
  const form = new FormData();
  form.append('gardenId', gardenId);
  form.append('file', blob, 'photo.jpg');
  const res = await fetch('/api/files', { method: 'POST', body: form });
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? 'upload'); // as: corps JSON d'erreur de /api/files
  return (await res.json()) as { attachmentId: string }; // as: réponse typée de /api/files (201)
}
