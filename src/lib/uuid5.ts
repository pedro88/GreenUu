import { createHash } from 'node:crypto';

/** UUID v5 (RFC 4122) : identifiants stables pour le seed déterministe. */
export function uuidv5(name: string, namespace: string): string {
  const ns = Buffer.from(namespace.replace(/-/g, ''), 'hex');
  const hash = createHash('sha1').update(Buffer.concat([ns, Buffer.from(name, 'utf8')])).digest();
  const bytes = hash.subarray(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export const SEED_NAMESPACE = '6f1c2a3e-9b4d-4e57-8a10-2c3d4e5f6a7b';
export const seedId = (name: string) => uuidv5(name, SEED_NAMESPACE);
