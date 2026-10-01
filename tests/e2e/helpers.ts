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
