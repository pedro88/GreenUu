/** Contrôles d'images côté serveur, sans dépendance (RG-JRN-03). */

export type ImageMime = 'image/jpeg' | 'image/png' | 'image/webp';

/** Type réel d'après les octets d'en-tête (jamais d'après l'extension ou le type déclaré). */
export function sniffImage(buf: Uint8Array): ImageMime | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => buf[i] === b)) return 'image/png';
  if (buf.length >= 12 && String.fromCharCode(...buf.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...buf.subarray(8, 12)) === 'WEBP') return 'image/webp';
  return null;
}

/** Dimensions (JPEG SOFn, PNG IHDR, WebP VP8/VP8L/VP8X). */
export function imageSize(buf: Uint8Array, mime: ImageMime): { width: number; height: number } | null {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (mime === 'image/png' && buf.length >= 24) return { width: view.getUint32(16), height: view.getUint32(20) };
  if (mime === 'image/webp' && buf.length >= 30) {
    const chunk = String.fromCharCode(...buf.subarray(12, 16));
    if (chunk === 'VP8 ') return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
    if (chunk === 'VP8L') {
      const b = view.getUint32(21, true);
      return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
    }
    if (chunk === 'VP8X') return { width: 1 + (buf[24] ?? 0) + ((buf[25] ?? 0) << 8) + ((buf[26] ?? 0) << 16), height: 1 + (buf[27] ?? 0) + ((buf[28] ?? 0) << 8) + ((buf[29] ?? 0) << 16) };
    return null;
  }
  if (mime === 'image/jpeg') {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) return null;
      const marker = buf[i + 1] ?? 0;
      const len = view.getUint16(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: view.getUint16(i + 5), width: view.getUint16(i + 7) };
      }
      i += 2 + len;
    }
  }
  return null;
}

/**
 * Retire les segments de métadonnées d'un JPEG (APP1 EXIF/XMP, APP2–APP15, COM), dont les coordonnées GPS.
 * Garde APP0 (JFIF) et tout ce qui suit le début des données d'image (SOS).
 */
export function stripJpegMetadata(buf: Uint8Array): Uint8Array {
  const out: Uint8Array[] = [buf.subarray(0, 2)];
  let i = 2;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff) break;
    const marker = buf[i + 1] ?? 0;
    if (marker === 0xda) break; // SOS : données compressées jusqu'à la fin
    const len = ((buf[i + 2] ?? 0) << 8) | (buf[i + 3] ?? 0);
    const isMeta = (marker >= 0xe1 && marker <= 0xef) || marker === 0xfe;
    if (!isMeta) out.push(buf.subarray(i, i + 2 + len));
    i += 2 + len;
  }
  out.push(buf.subarray(i));
  const total = out.reduce((n, p) => n + p.length, 0);
  const res = new Uint8Array(total);
  let o = 0;
  for (const p of out) {
    res.set(p, o);
    o += p.length;
  }
  return res;
}

export function hasExif(buf: Uint8Array): boolean {
  for (let i = 0; i + 10 < buf.length; i++) {
    if (buf[i] === 0xff && buf[i + 1] === 0xe1 && String.fromCharCode(...buf.subarray(i + 4, i + 8)) === 'Exif') return true;
  }
  return false;
}
