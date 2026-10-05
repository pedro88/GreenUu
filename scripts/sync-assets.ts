import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { ALL_PLAN_THUMBS } from '../src/game/plan-thumbs';
import { SYNCED_ACTIONS } from '../src/features/scene/avatar-action.pure';

/**
 * Copie les assets livrés par la session sprites (dossier `out_hd/` par défaut : version HD, tuile de 64 px pour une
 * tuile logique de 32 px) vers `public/sprites`.
 * Une vignette par espèce et par famille : stade récolte, sinon fruits, floraison, ou le dernier stade.
 * Copie aussi les atlas (`atlas.json`, `saison-<saison>.json`, `avatar-atlas.json`, `avatar-action-<action>.json` et
 * leurs pages `related_multi_packs`) dans `public/sprites/atlas`, sous un budget de poids par atlas, et les vignettes
 * de l'éditeur de plan dans `public/sprites/plan`.
 * Génère `src/generated/sprites.ts` (liste des vignettes disponibles, pour le repli à la compilation).
 */
const SRC = process.argv[2] ?? 'out_hd';
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

// Atlas (§9.2, format TexturePacker, éventuellement en plusieurs pages) : `atlas.json` pour la scène, `avatar-atlas.json`
// pour la composition de l'avatar (poses arrêt et marche). Copiés tels quels, validés par Zod au chargement. Les pages
// d'une livraison précédente sont retirées. Budget de poids par atlas (audit 2026-10-03, M1) : une livraison qui le
// dépasse est refusée, plutôt que d'alourdir en silence chaque ouverture de la vue jardin ou de l'éditeur.
const ATLAS_BUDGET = 2.5 * 1024 * 1024; // octets, JSON et PNG de toutes les pages d'un atlas
const atlasFiles = async (name: string) => {
  const main = JSON.parse(await readFile(path.join(SRC, name), 'utf8')) as { meta: { image: string; related_multi_packs?: string[] } }; // as: format TexturePacker
  const files: string[] = [];
  for (const json of [name, ...(main.meta.related_multi_packs ?? [])]) {
    const page = JSON.parse(await readFile(path.join(SRC, json), 'utf8')) as { meta: { image: string } }; // as: format TexturePacker
    files.push(json, page.meta.image);
  }
  return files;
};
// Saisons : seule la saison courante est chargée par la vue (§9.2). Actions de l'avatar : seulement celles que la vue
// jardin sait jouer (dernière action réelle, §9.5) et la conversation des rencontres (LIV-02).
const atlases = ['atlas.json', 'saison-printemps.json', 'saison-automne.json', 'saison-hiver.json', 'avatar-atlas.json', ...SYNCED_ACTIONS.map((a) => `avatar-action-${a}.json`)]
  .filter((n) => existsSync(path.join(SRC, n)));
const plan = await Promise.all(atlases.map(async (n) => ({ n, files: await atlasFiles(n) })));
for (const { n, files } of plan) {
  const bytes = (await Promise.all(files.map((f) => stat(path.join(SRC, f))))).reduce((t, s) => t + s.size, 0);
  if (bytes > ATLAS_BUDGET) {
    console.error(`${SRC}/${n} : ${(bytes / 1048576).toFixed(1)} Mo pour ${files.length / 2} page(s), au-delà du budget de ${ATLAS_BUDGET / 1048576} Mo. Livraison refusée, rien n'est copié.`);
    process.exit(1);
  }
}
await mkdir(path.join(DEST, 'icons'), { recursive: true });
const icons = new Map([...(await pickIcons(path.join(SRC, 'cultures'))), ...(await pickIcons(path.join(SRC, 'fleurs'))), ...(await pickIcons(path.join(SRC, 'familles'), 'family-'))]);
for (const [key, file] of icons) await copyFile(file, path.join(DEST, 'icons', `${key}.png`));
// Icônes d'interface, bulles d'état et objets de déco (vignettes de la palette de l'éditeur).
for (const [sub, to] of [['ui', 'ui'], ['bulles', 'bulles'], ['deco', 'decor']] as const) {
  const dir = path.join(SRC, sub);
  if (!existsSync(dir)) continue;
  await mkdir(path.join(DEST, to), { recursive: true });
  for (const f of (await readdir(dir)).filter((x) => x.endsWith('.png'))) await copyFile(path.join(dir, f), path.join(DEST, to, f));
}
// Vignettes de l'éditeur de plan (VOC-01) : la tuile ou l'objet réel de chaque type.
await rm(path.join(DEST, 'plan'), { recursive: true, force: true });
await mkdir(path.join(DEST, 'plan'), { recursive: true });
for (const frame of ALL_PLAN_THUMBS) {
  const file = path.join(SRC, `${frame}.png`);
  if (existsSync(file)) await copyFile(file, path.join(DEST, 'plan', `${frame.replace('/', '-')}.png`));
}
// Vignettes d'avatar (§10.5) : la frame de face, à l'arrêt, de chaque élément, en fichiers individuels. Une vignette
// n'a pas à télécharger l'atlas complet (audit lot 8, M1).
// Les clés livrées (`<clé>` ou `<clé>@<gabarit>`, d'après la frame de face) fixent la disponibilité des éléments, côté
// serveur comme côté client ; la table des décalages de tête par gabarit (`gabarits.json`) est copiée si elle existe.
const avatarSprites: string[] = [];
if (existsSync(path.join(SRC, 'avatar'))) {
  await mkdir(path.join(DEST, 'avatar'), { recursive: true });
  for (const f of (await readdir(path.join(SRC, 'avatar'))).filter((x) => x.endsWith('-bas-arret.png'))) {
    await copyFile(path.join(SRC, 'avatar', f), path.join(DEST, 'avatar', f));
    avatarSprites.push(f.replace(/-bas-arret\.png$/, ''));
  }
  if (existsSync(path.join(SRC, 'avatar', 'gabarits.json'))) await copyFile(path.join(SRC, 'avatar', 'gabarits.json'), path.join(DEST, 'avatar', 'gabarits.json'));
}
await writeFile('src/generated/avatar-sprites.ts', `// Généré par \`pnpm assets:sync\` — ne pas modifier à la main.\nexport const AVATAR_SPRITES: ReadonlySet<string> = new Set(${JSON.stringify(avatarSprites.sort(), null, 2)});\n`);
// Copie des atlas, une fois leur budget vérifié en tête de script.
if (atlases.length) {
  const dir = path.join(DEST, 'atlas');
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  for (const { files } of plan) for (const f of files) await copyFile(path.join(SRC, f), path.join(dir, f));
}
const keys = [...icons.keys()].sort();
await writeFile('src/generated/sprites.ts', `// Généré par \`pnpm assets:sync\` — ne pas modifier à la main.\nexport const SPRITE_ICONS: ReadonlySet<string> = new Set(${JSON.stringify(keys, null, 2)});\n`);
console.log(`${keys.length} vignettes synchronisées depuis ${SRC}/`);
