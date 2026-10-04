import { createReadStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { gzipSync } from 'node:zlib';
import { normalizeSearch } from '../src/lib/text';

/**
 * Construit la base de communes embarquée (SPEC §12.10, LOC, §17 Q-24) à partir des fichiers GeoNames (CC BY 4.0) :
 * codes postaux (`export/zip/<PAYS>.txt`) enrichis de la population et de l'altitude du vidage principal
 * (`export/dump/<PAYS>.txt`, lieux habités et communes). À relancer seulement pour mettre la base à jour ; le résultat,
 * `src/features/location/data/communes.tsv.gz`, est versionné et chargé par `pnpm db:reference`.
 *
 *   pnpm tsx scripts/build-communes.ts <dossier GeoNames>   (contient dump/<PAYS>.txt et zip/<PAYS>/<PAYS>.txt)
 */
const COUNTRIES = ['BE', 'FR', 'LU', 'CH'] as const;
const SRC = process.argv[2];
if (!SRC) throw new Error('usage : build-communes.ts <dossier GeoNames>');
const OUT = 'src/features/location/data/communes.tsv.gz';
const MATCH_KM = 15;

type Place = { lat: number; lng: number; population: number; dem: number | null };

async function* lines(file: string) {
  for await (const line of createInterface({ input: createReadStream(file, 'utf8'), crlfDelay: Infinity })) if (line) yield line.split('\t');
}

const km = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180 * Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180);
  return 6371 * Math.sqrt(dLat * dLat + dLng * dLng);
};

const rows: string[] = [];
for (const c of COUNTRIES) {
  // Lieux habités (P) et communes (ADM3, ADM4), indexés par nom normalisé.
  const places = new Map<string, Place[]>();
  for await (const f of lines(path.join(SRC, 'dump', `${c}.txt`))) {
    const [, name = '', ascii = '', , lat = '', lng = '', cls = '', code = '', , , , , , , population = '0', , dem = ''] = f;
    if (!(cls === 'P' || (cls === 'A' && (code === 'ADM3' || code === 'ADM4')))) continue;
    const p: Place = { lat: Number(lat), lng: Number(lng), population: Number(population) || 0, dem: dem && dem !== '-9999' ? Number(dem) : null };
    for (const key of new Set([normalizeSearch(name), normalizeSearch(ascii)])) places.set(key, [...(places.get(key) ?? []), p]);
  }
  const seen = new Set<string>();
  let n = 0;
  for await (const f of lines(path.join(SRC, 'zip', c, `${c}.txt`))) {
    const [, postal = '', name = '', region = '', , , , , , lat = '', lng = ''] = f;
    if (!postal || !name || !lat || !lng || /cedex/i.test(`${postal} ${name}`)) continue;
    const key = `${postal}|${normalizeSearch(name)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const at = { lat: Number(lat), lng: Number(lng) };
    // Le même nom à moins de 15 km : sa population (la plus grande) et son altitude.
    const match = (places.get(normalizeSearch(name)) ?? []).filter((p) => km(p, at) <= MATCH_KM).sort((a, b) => b.population - a.population)[0];
    rows.push([c, postal, name, region, at.lat.toFixed(4), at.lng.toFixed(4), String(match?.population ?? 0), match?.dem == null ? '' : String(match.dem)].join('\t'));
    n += 1;
  }
  console.log(`${c} : ${n} communes`);
}
await mkdir(path.dirname(OUT), { recursive: true });
const tsv = `# GeoNames (https://www.geonames.org), CC BY 4.0 — pays, code postal, nom, région, latitude, longitude, population, altitude\n${rows.join('\n')}\n`;
await writeFile(OUT, gzipSync(tsv, { level: 9 }));
console.log(`${rows.length} lignes → ${OUT}`);
