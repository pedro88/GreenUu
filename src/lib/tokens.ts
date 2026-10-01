import { createHash, randomBytes } from 'node:crypto';

/** Jeton aléatoire de 32 octets (base64url) et son empreinte SHA-256, seule stockée (RG-INV-01). */
export function newToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
