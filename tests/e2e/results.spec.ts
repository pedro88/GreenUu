import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { zipEntryNames } from '../../src/lib/zip';
import { gardenId, zoneId } from './ids';
import { clearMail, linkFrom, login, waitForMail } from './helpers';
import { TEST_DB } from './db';
import postgres from 'postgres';

const CANAL = gardenId('canal');
const TILLEULS = gardenId('tilleuls');

test.describe('bilans, recommandations, confidentialité', () => {
  test('[RES-01] bilan d\'une culture terminée : total pré-rempli, complétude 100 %, 1,4 kg/m², événement émis', async ({ page }) => {
    await login(page, 'david');
    await page.goto(`/app/jardins/${CANAL}/cultures`);
    await page.getByTestId('culture-list').getByRole('link', { name: /Haricot Contender/ }).first().click();
    await page.getByTestId('culture-result').click();
    // Première compilation de la route par `next dev` : l'attente dépasse le délai par défaut des assertions.
    await expect(page).toHaveURL(/\/bilan$/, { timeout: 45_000 });
    await expect(page.getByTestId('result-total')).toHaveValue('4.2');
    await page.getByTestId('quality-4').check();
    await page.getByTestId('result-success').fill('80');
    await page.getByLabel('Mildiou').check();
    await page.getByTestId('rating-4').check();
    await page.getByTestId('result-again-yes').check();
    await page.getByTestId('result-save').click();
    await expect(page.getByTestId('result-saved')).toHaveText('Bilan enregistré : complétude 100 %.');
    await expect(page.getByTestId('result-yield')).toHaveText('Rendement : 1,4 kg/m².');
    const sql = postgres(TEST_DB, { max: 1 });
    try {
      const [e] = await sql<{ n: number }[]>`select count(*)::int as n from domain_event where type = 'result.submitted' and garden_id = ${CANAL}`;
      expect(e?.n).toBeGreaterThanOrEqual(1);
    } finally {
      await sql.end();
    }
  });

  test('[RCO-04] « Que planter ? » pour la Planche 1 au printemps : variétés expliquées, avec un indice de confiance', async ({ page }) => {
    await login(page, 'alice');
    await page.goto(`/app/jardins/${TILLEULS}/recommandations?zone=${zoneId('tilleuls', 'p1')}&periode=spring`);
    const items = page.getByTestId('reco-item');
    await expect(items.first()).toBeVisible();
    await expect(items.first().getByTestId('reco-explanation')).toHaveText(/^\d+ jardins à contexte proche, réussite moyenne \d+ %, rendement médian [\d,]+ kg\/m²$/);
    await expect(items.first().getByTestId('reco-confidence')).toHaveText(/^Confiance : (élevée|moyenne|faible)$/);
    // Démarrage à froid explicite pour une espèce trop peu documentée (§7.5).
    await page.goto(`/app/jardins/${TILLEULS}/recommandations?zone=${zoneId('tilleuls', 'p1')}&periode=spring&espece=${await carrotId()}`);
    await expect(page.getByTestId('reco-cold-start')).toContainText('sur les 5 nécessaires');
  });

  test('[PRV-07] export des données : e-mail Mailpit, archive avec profil, contributions, journal d\'XP et photos', async ({ page }) => {
    await login(page, 'chloe');
    const upload = await page.request.post('/api/files', {
      multipart: { gardenId: CANAL, file: { name: 'photo.jpg', mimeType: 'image/jpeg', buffer: readFileSync('tests/e2e/fixtures/photo-small.jpg') } },
    });
    expect(upload.status()).toBe(201);
    await clearMail('chloe@greenu.test');
    await page.goto('/app/parametres/confidentialite');
    await page.getByTestId('export-request').click();
    await expect(page.getByTestId('export-requested')).toBeVisible();
    const link = linkFrom((await waitForMail('chloe@greenu.test', 'Ton export de données est prêt')).text, '/app/parametres/confidentialite/export/');
    const res = await page.request.get(link);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toBe('application/zip');
    const names = zipEntryNames(new Uint8Array(await res.body()));
    for (const n of ['profil.json', 'adhesions.json', 'cultures.json', 'journal.json', 'tips.json', 'xp.json', 'consentements.json']) expect(names, n).toContain(n);
    expect(names.some((n) => n.startsWith('photos/'))).toBe(true);
    // Le lien ne sert qu'à son titulaire.
    const other = await (await page.context().browser()?.newContext())?.newPage();
    if (other) {
      await login(other, 'emma');
      expect((await other.request.get(link)).status()).toBe(404);
    }
  });
});

async function carrotId() {
  const { seedId } = await import('../../src/lib/uuid5');
  return seedId('species:carotte');
}

test.describe('suppression du compte', () => {
  test('[PRV-09] supprimer son compte le désactive aussitôt (session et connexion), et le lien reçu le rétablit', async ({ page, browser }) => {
    const { uniqueEmail, uniquePseudo } = await import('./helpers');
    const email = uniqueEmail('depart');
    const password = 'une-phrase-de-passe-solide';
    await page.goto('/inscription');
    await page.getByLabel('Adresse e-mail').fill(email);
    await page.getByLabel('Pseudo').fill(uniquePseudo('depart'));
    await page.getByLabel('Mot de passe').fill(password);
    await page.getByLabel(/J'accepte les/).check();
    await page.getByRole('button', { name: 'Créer mon compte' }).click();
    await expect(page).toHaveURL(/\/bienvenue$/);
    // Seconde session, ouverte AVANT la demande : elle ne doit plus servir.
    const other = await (await browser.newContext()).newPage();
    const signIn = async (p: typeof page) => {
      await p.goto('/connexion');
      await p.getByLabel('Adresse e-mail').fill(email);
      await p.getByLabel('Mot de passe').fill(password);
      await p.getByRole('button', { name: 'Se connecter' }).click();
    };
    await signIn(other);
    await expect(other).toHaveURL(/\/app/);

    await page.goto('/app/parametres/confidentialite');
    await page.getByTestId('deletion-confirm').check();
    await page.getByTestId('deletion-submit').click();
    await expect(page.getByTestId('deletion-requested')).toBeVisible();

    await other.goto('/app');
    await expect(other).toHaveURL(/\/connexion/);
    await signIn(other);
    await expect(other.getByText('Ce compte est en cours de suppression', { exact: false })).toBeVisible();
    await expect(other).toHaveURL(/\/connexion/);

    const link = linkFrom((await waitForMail(email, 'Ton compte sera supprimé')).text, '/retablissement/');
    const anonymous = await (await browser.newContext()).newPage();
    await anonymous.goto(link);
    await anonymous.getByTestId('restore-submit').click();
    await expect(anonymous.getByTestId('restore-done')).toBeVisible();
    await signIn(other);
    await expect(other).toHaveURL(/\/app/);
  });
});
