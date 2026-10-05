import { expect, type Page } from '@playwright/test';

export const SEED_PASSWORD = 'jardin-seed-2026';
export const MAILPIT = process.env.MAILPIT_API_URL ?? 'http://localhost:8026';

export async function login(page: Page, key: string, next?: string) {
  await page.goto(next ? `/connexion?next=${encodeURIComponent(next)}` : '/connexion');
  await page.getByLabel('Adresse e-mail').fill(`${key}@greenu.test`);
  await page.getByLabel('Mot de passe').fill(SEED_PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/connexion'));
}

/** Adresse unique par test : Mailpit n'est pas vidé entre les exécutions. */
export function uniqueEmail(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@greenu.test`;
}

export function uniquePseudo(prefix: string) {
  return `${prefix}${Date.now().toString(36)}`.slice(0, 24);
}

type MailpitSummary = { ID: string; Subject: string };

/** Attend un e-mail dans Mailpit (API HTTP) et renvoie son sujet et son texte. */
export async function waitForMail(to: string, subjectIncludes: string): Promise<{ subject: string; text: string }> {
  let found: MailpitSummary | undefined;
  await expect
    .poll(async () => {
      const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
      const body = (await res.json()) as { messages: MailpitSummary[] }; // as: format documenté de l'API Mailpit
      found = body.messages.find((m) => m.Subject.includes(subjectIncludes));
      return found !== undefined;
    }, { timeout: 20_000, message: `e-mail « ${subjectIncludes} » pour ${to}` })
    .toBe(true);
  const res = await fetch(`${MAILPIT}/api/v1/message/${found?.ID ?? ''}`);
  const msg = (await res.json()) as { Subject: string; Text: string }; // as: format documenté de l'API Mailpit
  return { subject: msg.Subject, text: msg.Text };
}

export function linkFrom(text: string, path: string): string {
  const m = text.match(new RegExp(`https?://\\S+${path}\\S*`));
  if (!m) throw new Error(`lien ${path} introuvable dans l'e-mail`);
  return m[0];
}

/** Purge les e-mails d'un destinataire du seed (adresse fixe) : un test ne doit lire que ceux qu'il provoque. */
export async function clearMail(to: string) {
  await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`, { method: 'DELETE' });
}

/**
 * Le canvas WebGL est prêt. Chromium fournit WebGL : le rendu de repli (`unavailable`) n'est pas un succès ici. C'est
 * lui qui masquait le blocage de PixiJS par la CSP de production (E2E-MAP-01b, audit lot 7 M1).
 */
export async function sceneReady(page: Page, testId = 'garden-view') {
  await expect(page.getByTestId(testId)).toHaveAttribute('data-canvas', 'ready');
  await expect(page.getByTestId(testId).locator('canvas')).toHaveCount(1);
}

/** Trace un trait sur la grille du plan, de case en case, à partir des attributs exposés par la couche (§9.6). */
export async function strokeTiles(page: Page, path: { x: number; y: number }[], steps = 8) {
  const grid = page.getByTestId('plan-grid');
  await grid.scrollIntoViewIfNeeded();
  const box = await grid.boundingBox();
  if (!box) throw new Error('grille absente');
  const tile = Number(await grid.getAttribute('data-tile-px'));
  const ox = Number(await grid.getAttribute('data-origin-x'));
  const oy = Number(await grid.getAttribute('data-origin-y'));
  const at = (t: { x: number; y: number }) => ({ x: box.x + ox + (t.x + 0.5) * tile, y: box.y + oy + (t.y + 0.5) * tile });
  const [first, ...rest] = path;
  if (!first) return;
  await page.mouse.move(at(first).x, at(first).y);
  await page.mouse.down();
  for (const p of rest) await page.mouse.move(at(p).x, at(p).y, { steps });
  await page.mouse.up();
}

/** Glisser d'une tuile à une autre (dessin d'un rectangle, déplacement). */
export const dragTiles = (page: Page, from: { x: number; y: number }, to: { x: number; y: number }) => strokeTiles(page, [from, to], 6);
