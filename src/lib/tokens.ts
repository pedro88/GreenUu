import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** Jeton aléatoire de 32 octets (base64url) et son empreinte SHA-256, seule stockée (RG-INV-01). */
export function newToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}


/** Jeton signé (HMAC-SHA256) sans état : `payload.signature`, en base64url (désinscription des e-mails). */
export function signPayload(payload: string, secret: string): string {
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${Buffer.from(payload).toString('base64url')}.${sig}`;
}

export function verifyPayload(token: string, secret: string): string | null {
  const [p, sig] = token.split('.');
  if (!p || !sig) return null;
  const payload = Buffer.from(p, 'base64url').toString('utf8');
  const expected = createHmac('sha256', secret).update(payload).digest();
  const given = Buffer.from(sig, 'base64url');
  return given.length === expected.length && timingSafeEqual(given, expected) ? payload : null;
}
