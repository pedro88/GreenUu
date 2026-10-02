import { copyFile, mkdir, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

/**
 * Copie les assets livrés par la session sprites (dossier `out/`, hors de ce dépôt) vers `public/sprites`.
 * Une vignette par espèce et par famille : stade récolte, sinon fruits, floraison, ou le dernier stade.
 * Copie aussi l'atlas de la vue jardin (`atlas.json`, `atlas.png`) dans `public/sprites/atlas`.
 * Génère `src/generated/sprites.ts` (liste des vignettes disponibles, pour le repli à la compilation).
 */
const SRC = process.argv[2] ?? 'out';
const DEST = 'public/sprites';
const PREFERRED = ['recolte', 'fruits', 'floraison', 'feuillage', 'croissance'];

if (!existsSync(SRC)) {
  console.warn(`Pas de dossier ${SRC}/ : assets non synchronisés (les vignettes de repli seront utilisées).`);
  process.exit(0);
}

async function pickIcons(dir: string, prefix = ''): Promise<Map<string, string>> {
  if (!existsSync(dir)) return new Map();
  const files = (await readdir(dir)).filter((f) => f.endsWith('.png'));
  const byKey = new Map<string, { file: string; rank: number; n: number }>();
  for (const f of files) {
    const m = f.match(/^(.+?)-(\d)-(.+)\.png$/);
    if (!m?.[1] || !m[2] || !m[3]) continue;
    const key = `${prefix}${m[1]}`;
    const prefIdx = PREFERRED.findIndex((p) => m[3]?.startsWith(p));
    const rank = prefIdx === -1 ? PREFERRED.length : prefIdx;
    const n = Number(m[2]);
    const cur = byKey.get(key);
    if (!cur || rank < cur.rank || (rank === cur.rank && n > cur.n)) byKey.set(key, { file: path.join(dir, f), rank, n });
  }
  return new Map([...byKey].map(([k, v]) => [k, v.file]));
}

await mkdir(path.join(DEST, 'icons'), { recursive: true });
const icons = new Map([...(await pickIcons(path.join(SRC, 'cultures'))), ...(await pickIcons(path.join(SRC, 'fleurs'))), ...(await pickIcons(path.join(SRC, 'familles'), 'family-'))]);
for (const [key, file] of icons) await copyFile(file, path.join(DEST, 'icons', `${key}.png`));
for (const sub of ['ui', 'bulles']) {
  const dir = path.join(SRC, sub);
  if (!existsSync(dir)) continue;
  await mkdir(path.join(DEST, sub), { recursive: true });
  for (const f of (await readdir(dir)).filter((x) => x.endsWith('.png'))) await copyFile(path.join(dir, f), path.join(DEST, sub, f));
}
// Atlas de la vue jardin (§9.2, format TexturePacker) : copié tel quel, validé par Zod au chargement par le moteur.
if (existsSync(path.join(SRC, 'atlas.json')) && existsSync(path.join(SRC, 'atlas.png'))) {
  await mkdir(path.join(DEST, 'atlas'), { recursive: true });
  for (const f of ['atlas.json', 'atlas.png']) await copyFile(path.join(SRC, f), path.join(DEST, 'atlas', f));
}
const keys = [...icons.keys()].sort();
await writeFile('src/generated/sprites.ts', `// Généré par \`pnpm assets:sync\` — ne pas modifier à la main.\nexport const SPRITE_ICONS: ReadonlySet<string> = new Set(${JSON.stringify(keys, null, 2)});\n`);
console.log(`${keys.length} vignettes synchronisées depuis ${SRC}/`);
