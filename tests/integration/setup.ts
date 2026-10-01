import { vi } from 'vitest';
import { testEnv } from './env';

Object.assign(process.env, testEnv());

/* Les Server Actions dépendent de Next : on simule une requête avec un pot de cookies en mémoire. */
const jar = new Map<string, string>();
export const cookieJar = jar;

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined, updateTag: () => undefined }));
vi.mock('next/headers', () => ({
  headers: async () => new Headers(jar.size ? { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') } : {}),
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    has: (name: string) => jar.has(name),
    set: (name: string | { name: string; value: string }, value?: string) => {
      if (typeof name === 'string') jar.set(name, value ?? '');
      else jar.set(name.name, name.value);
    },
    delete: (name: string) => jar.delete(name),
  }),
}));
