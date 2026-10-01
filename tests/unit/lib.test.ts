import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isCommonPassword } from '@/features/account/common-passwords';
import { registerSchema, safeNext } from '@/features/account/schema';
import { gardenCreateSchema } from '@/features/garden/schema';
import { decodeGeohash, encodeGeohash } from '@/lib/geohash';
import { hashToken, newToken } from '@/lib/tokens';
import { parseEnv } from '@/server/env';

describe('environnement', () => {
  it("[ENV-01] une variable obligatoire manquante arrête l'app avec son nom", () => {
    expect(() => parseEnv({ APP_URL: 'http://x', SMTP_HOST: 'h', SMTP_PORT: '1', MAIL_FROM: 'a@b', BETTER_AUTH_SECRET: 'x'.repeat(32) })).toThrow(/DATABASE_URL/);
  });
});

describe('geohash', () => {
  it('encode à la précision 4 et redécode le centre de la cellule', () => {
    const h = encodeGeohash(48.8566, 2.3522, 4);
    expect(h).toBe('u09t');
    const c = decodeGeohash(h);
    expect(Math.abs(c.lat - 48.8566)).toBeLessThan(0.2);
    expect(Math.abs(c.lng - 2.3522)).toBeLessThan(0.2);
  });
});

describe('comptes', () => {
  it('[AUTH-02] mot de passe trop court ou courant, pseudo invalide', () => {
    const base = { email: 'a@b.fr', password: 'une-phrase-de-passe', pseudo: 'alice', acceptTerms: true };
    expect(registerSchema.safeParse(base).success).toBe(true);
    expect(registerSchema.safeParse({ ...base, password: 'court' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, password: 'motdepasse123' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, pseudo: 'A B' }).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, acceptTerms: false }).success).toBe(false);
    expect(isCommonPassword('aaaaaaaaaaaaaa')).toBe(true);
  });

  it('redirection `next` limitée aux chemins internes', () => {
    expect(safeNext('/app/jardins')).toBe('/app/jardins');
    expect(safeNext('//evil.com')).toBe('/app');
    expect(safeNext('https://evil.com')).toBe('/app');
    expect(safeNext(undefined)).toBe('/app');
  });

  it("[INV-01] jeton d'invitation aléatoire, seul le hash est stocké", () => {
    const a = newToken();
    const b = newToken();
    expect(a.token).not.toBe(b.token);
    expect(a.hash).toBe(hashToken(a.token));
    expect(a.hash).toHaveLength(64);
  });
});

describe('jardin', () => {
  it('[GRD-02] un environnement au moins', () => {
    const base = { name: 'Potager', orgType: 'family', environments: ['open_air'], lat: '48.8', lng: '2.3', timezone: 'Europe/Paris' };
    expect(gardenCreateSchema.safeParse(base).success).toBe(true);
    const r = gardenCreateSchema.safeParse({ ...base, environments: [] });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(['environments']);
  });
});

describe('i18n', () => {
  it('[I18N-02] fr et en ont exactement les mêmes clés', () => {
    const keys = (o: unknown, p = ''): string[] =>
      typeof o === 'object' && o !== null ? Object.entries(o).flatMap(([k, v]) => keys(v, p ? `${p}.${k}` : k)) : [p];
    const fr = keys(JSON.parse(readFileSync('src/i18n/messages/fr.json', 'utf8'))).sort();
    const en = keys(JSON.parse(readFileSync('src/i18n/messages/en.json', 'utf8'))).sort();
    expect(en).toEqual(fr);
  });
});
