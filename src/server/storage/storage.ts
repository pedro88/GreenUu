import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../env';

/** Stockage des fichiers (SPEC §3.1) : disque local en dev / test ; pilote S3 au déploiement. */
export interface FileStorage {
  put(key: string, data: Uint8Array): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  remove(key: string): Promise<void>;
}

export function localStorage(root: string): FileStorage {
  const full = (key: string) => {
    const p = path.resolve(root, key);
    if (!p.startsWith(path.resolve(root) + path.sep)) throw new Error('Clé de stockage invalide');
    return p;
  };
  return {
    async put(key, data) {
      await mkdir(path.dirname(full(key)), { recursive: true });
      await writeFile(full(key), data);
    },
    async get(key) {
      try {
        return new Uint8Array(await readFile(full(key)));
      } catch {
        return null;
      }
    },
    async remove(key) {
      await rm(full(key), { force: true });
    },
  };
}

let instance: FileStorage | undefined;

export function storage(): FileStorage {
  const e = env();
  if (e.STORAGE_DRIVER === 's3') throw new Error('Pilote S3 non configuré (prévu au déploiement, SPEC §17 Q-12)');
  instance ??= localStorage(e.STORAGE_LOCAL_DIR);
  return instance;
}
