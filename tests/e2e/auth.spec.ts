import { expect, test } from '@playwright/test';
import { clearMail, linkFrom, login, SEED_PASSWORD, uniqueEmail, uniquePseudo, waitForMail } from './helpers';

test.describe('authentification', () => {
  test('[AUTH-01] inscription : compte créé, e-mail de vérification, redirection vers /bienvenue', async ({ page }) => {
    const email = uniqueEmail('ines');
    await page.goto('/inscription');
    await page.getByLabel('Adresse e-mail').fill(email);
    await page.getByLabel('Pseudo').fill(uniquePseudo('ines'));
    await page.getByLabel('Mot de passe').fill('une-phrase-de-passe-solide');
    await page.getByLabel(/J'accepte les/).check();
    await page.getByRole('button', { name: 'Créer mon compte' }).click();
    await expect(page).toHaveURL(/\/bienvenue$/);
    await expect(page.getByTestId('verify-banner')).toBeVisible();
    const mail = await waitForMail(email, 'Confirme ton adresse');
    expect(linkFrom(mail.text, '/verification/')).toContain('/verification/');
  });

  test('[AUTH-04] le lien de vérification confirme l\'adresse ; un second usage est signalé', async ({ page }) => {
    const email = uniqueEmail('jules');
    await page.goto('/inscription');
    await page.getByLabel('Adresse e-mail').fill(email);
    await page.getByLabel('Pseudo').fill(uniquePseudo('jules'));
    await page.getByLabel('Mot de passe').fill('une-phrase-de-passe-solide');
    await page.getByLabel(/J'accepte les/).check();
    await page.getByRole('button', { name: 'Créer mon compte' }).click();
    await expect(page).toHaveURL(/\/bienvenue$/);
    const link = linkFrom((await waitForMail(email, 'Confirme ton adresse')).text, '/verification/');
    await page.goto(link);
    await expect(page.getByTestId('verify-status')).toHaveAttribute('data-state', 'verified');
    await page.goto('/bienvenue');
    await expect(page.getByTestId('verify-banner')).toHaveCount(0);
    await page.goto(link);
    await expect(page.getByTestId('verify-status')).toHaveAttribute('data-state', 'alreadyUsed');
  });

  // Compte dédié : le mot de passe change, aucun autre test ne doit s'en servir ensuite.
  test('[AUTH-07] réinitialisation : nouveau mot de passe, connexion, lien à usage unique', async ({ page, browser }) => {
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await login(otherPage, 'farid');
    await clearMail('farid@greenu.test');
    await page.goto('/mot-de-passe-oublie');
    await page.getByLabel('Adresse e-mail').fill('farid@greenu.test');
    await page.getByRole('button', { name: 'Envoyer le lien' }).click();
    await expect(page.getByText('un e-mail vient d\'être envoyé')).toBeVisible();
    const link = linkFrom((await waitForMail('farid@greenu.test', 'Réinitialise')).text, '/reinitialisation/');
    await page.goto(link);
    await page.getByLabel('Nouveau mot de passe').fill('nouvelle-phrase-de-passe');
    await page.getByRole('button', { name: 'Enregistrer et me connecter' }).click();
    await expect(page).toHaveURL(/\/app$/);
    // Les autres sessions sont révoquées.
    await otherPage.goto('/app');
    await expect(otherPage).toHaveURL(/\/connexion/);
    // Le lien ne fonctionne plus.
    await page.goto(link);
    await page.getByLabel('Nouveau mot de passe').fill('encore-une-autre-phrase');
    await page.getByRole('button', { name: 'Enregistrer et me connecter' }).click();
    await expect(page.getByText('Ce lien a expiré ou a déjà été utilisé.')).toBeVisible();
    await other.close();
  });

  test('[AUTH-09] une page /app sans session redirige vers la connexion puis y revient', async ({ page }) => {
    await page.goto('/app/jardins');
    await expect(page).toHaveURL(/\/connexion\?next=%2Fapp%2Fjardins/);
    await page.getByLabel('Adresse e-mail').fill('alice@greenu.test');
    await page.getByLabel('Mot de passe').fill(SEED_PASSWORD);
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await expect(page).toHaveURL(/\/app\/jardins$/);
  });

  test('[POL-01] soumis avant l\'hydratation, le formulaire de connexion n\'envoie jamais les identifiants dans l\'URL', async ({ page }) => {
    // Réseau lent poussé à l'extrême : aucun script ne s'exécute, la page n'est jamais hydratée.
    await page.route('**/*.js', (r) => r.abort());
    const urls: string[] = [];
    page.on('request', (r) => urls.push(r.url()));
    await page.goto('/connexion');
    await page.getByLabel('Adresse e-mail').fill('alice@greenu.test');
    await page.getByLabel('Mot de passe').fill(SEED_PASSWORD);
    const submitted = page.waitForRequest((r) => r.isNavigationRequest());
    await page.getByRole('button', { name: 'Se connecter' }).click();
    const req = await submitted;
    expect(req.method()).toBe('POST');
    expect(urls.filter((u) => u.includes('password') || u.includes(encodeURIComponent(SEED_PASSWORD)) || u.includes(SEED_PASSWORD))).toEqual([]);
    expect(page.url()).not.toContain('password');
  });
});
