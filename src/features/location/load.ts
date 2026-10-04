import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { count, sql } from 'drizzle-orm';
import { normalizeSearch } from '@/lib/text';
import type { Executor } from '@/server/db/client';
import { commune } from '@/server/db/schema';

/** Fichier versionné produit par `scripts/build-communes.ts` (GeoNames, CC BY 4.0). */
const DATA = path.join(process.cwd(), 'src/features/location/data/communes.tsv.gz');
const BATCH = 2000;

/**
 * Charge la base de communes (SPEC §12.10, LOC). Idempotent : si la table compte déjà autant de lignes que le
 * fichier, rien n'est fait ; sinon elle est rechargée entièrement (données publiques, sans références entrantes).
 */
export async function loadCommunes(tx: Executor): Promise<void> {
  const rows = gunzipSync(await readFile(DATA)).toString('utf8').split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.split('\t'));
  const [current] = await tx.select({ n: count() }).from(commune);
  if (current?.n === rows.length) return;
  await tx.execute(sql`truncate table ${commune}`);
  for (let i = 0; i < rows.length; i += BATCH) {
    await tx.insert(commune).values(rows.slice(i, i + BATCH).map(([countryCode = '', postalCode = '', name = '', region = '', lat = '0', lng = '0', population = '0', elevation = '']) => ({
      countryCode, postalCode, name, region, lat: Number(lat), lng: Number(lng), population: Number(population) || 0,
      elevationM: elevation === '' ? null : Number(elevation), searchText: normalizeSearch(name),
    })));
  }
}
