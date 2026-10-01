import { existsSync, readFileSync } from 'node:fs';

/**
 * Traçabilité critères ↔ tests (SPEC §13.3) : chaque critère du lot courant (et des précédents)
 * doit apparaître dans le titre d'au moins un test ; un test ne doit pas citer d'ID inconnu.
 */
type Config = { currentLot: number; transverseByLot: Record<string, string[]> };
const config = JSON.parse(readFileSync('spec.config.json', 'utf8')) as Config; // as: fichier de configuration du dépôt
const spec = readFileSync('SPEC.md', 'utf8');
const section = spec.slice(spec.indexOf('## 12. Critères'), spec.indexOf('## 13. Stratégie'));

const lotOf = new Map<string, number>();
let lot = 0;
for (const line of section.split('\n')) {
  const h = line.match(/^### 12\.\d+ Lot (\d+)/);
  if (h) lot = Number(h[1]);
  else if (/^### 12\.\d+ /.test(line)) lot = 0;
  const id = line.match(/^\| ([A-Z0-9]+-\d+)/)?.[1];
  if (id) lotOf.set(id, lot);
}
for (const [l, ids] of Object.entries(config.transverseByLot)) for (const id of ids) lotOf.set(id, Number(l));

const titles: string[] = [];
if (existsSync('reports/vitest.json')) {
  const v = JSON.parse(readFileSync('reports/vitest.json', 'utf8')) as { testResults: { assertionResults: { fullName: string; status: string }[] }[] }; // as: format JSON de Vitest
  for (const f of v.testResults) for (const a of f.assertionResults) if (a.status === 'passed') titles.push(a.fullName);
}
if (existsSync('reports/playwright.json')) {
  type Suite = { title: string; suites?: Suite[]; specs?: { title: string; ok: boolean }[] };
  const p = JSON.parse(readFileSync('reports/playwright.json', 'utf8')) as { suites: Suite[] }; // as: format JSON de Playwright
  const walk = (s: Suite, prefix: string) => {
    for (const sp of s.specs ?? []) if (sp.ok) titles.push(`${prefix} ${s.title} ${sp.title}`);
    for (const c of s.suites ?? []) walk(c, `${prefix} ${s.title}`);
  };
  p.suites.forEach((s) => walk(s, ''));
}

const cited = new Set(titles.flatMap((t) => [...t.matchAll(/\[([A-Z0-9]+-\d+)\]/g)].map((m) => m[1] ?? '')));
const expected = [...lotOf].filter(([, l]) => l > 0 && l <= config.currentLot).map(([id]) => id);
const missing = expected.filter((id) => !cited.has(id));
const unknown = [...cited].filter((id) => !lotOf.has(id));

console.log(`Lot ${config.currentLot} : ${expected.length - missing.length}/${expected.length} critères couverts par des tests au vert.`);
if (missing.length) console.error(`Sans test : ${missing.join(', ')}`);
if (unknown.length) console.error(`IDs inconnus de la spec : ${unknown.join(', ')}`);
process.exit(missing.length || unknown.length ? 1 : 0);
