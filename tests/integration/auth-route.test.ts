import { describe, expect, it } from 'vitest';
import { GET, POST } from '../../src/app/api/auth/[...all]/route';

const url = (p: string) => `http://localhost:3000/api/auth${p}`;
const json = (body: unknown) => ({ method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' }, body: JSON.stringify(body) });

describe('endpoints HTTP de Better Auth', () => {
  it('[AUTH-01] l\'inscription directe hors Server Action est refusée (profil et CGU obligatoires)', async () => {
    const res = await POST(new Request(url('/sign-up/email'), json({ email: `direct-${Date.now()}@test.local`, password: 'une-phrase-de-passe-solide', name: 'x' })));
    expect(res.status).toBe(404);
  });

  it('[AUTH-06] la connexion directe, qui contournerait la limite par e-mail, est refusée', async () => {
    const res = await POST(new Request(url('/sign-in/email'), json({ email: 'a@test.local', password: 'x' })));
    expect(res.status).toBe(404);
    expect((await POST(new Request(url('/request-password-reset'), json({ email: 'a@test.local' })))).status).toBe(404);
  });

  it('les endpoints de session restent disponibles', async () => {
    const res = await GET(new Request(url('/get-session')));
    expect(res.status).toBe(200);
  });
});
