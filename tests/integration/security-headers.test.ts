import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { proxy } from '../../src/proxy';
import { contentSecurityPolicy, staticSecurityHeaders } from '../../src/server/security-headers';

describe('en-têtes de sécurité', () => {
  it('la CSP est posée avec un nonce unique par requête et interdit l\'encadrement', () => {
    const a = proxy(new NextRequest('http://localhost:3000/connexion')).headers.get('Content-Security-Policy') ?? '';
    const b = proxy(new NextRequest('http://localhost:3000/connexion')).headers.get('Content-Security-Policy') ?? '';
    expect(a).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
    expect(a).toContain("frame-ancestors 'none'");
    expect(a).not.toBe(b);
  });

  it('upgrade-insecure-requests et HSTS seulement en production', () => {
    expect(contentSecurityPolicy('n', true)).not.toContain('upgrade-insecure-requests');
    expect(contentSecurityPolicy('n', false)).toContain('upgrade-insecure-requests');
    expect(staticSecurityHeaders(false).map((h) => h.key)).not.toContain('Strict-Transport-Security');
    expect(staticSecurityHeaders(true).map((h) => h.key)).toEqual(expect.arrayContaining(['Strict-Transport-Security', 'X-Frame-Options', 'Referrer-Policy', 'Permissions-Policy']));
  });
});
