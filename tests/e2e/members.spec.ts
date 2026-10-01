import { expect, test } from '@playwright/test';
import { gardenId } from './ids';
import { linkFrom, login, uniqueEmail, uniquePseudo, waitForMail } from './helpers';

test.describe('membres, invitations, groupes', () => {
  test('[INV-01] [INV-02] invitation reçue dans Mailpit, acceptée par une personne sans compte', async ({ page, browser }) => {
    const email = uniqueEmail('invite');
    await login(page, 'chloe');
    await page.goto(`/app/jardins/${gardenId('canal')}/membres`);
    await page.getByTestId('invite-open').click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Adresse e-mail').fill(email);
    await dialog.getByLabel('Rôle').selectOption('member');
    await dialog.getByRole('button', { name: "Envoyer l'invitation" }).click();
    await expect(page.getByText(`Invitation envoyée à ${email}.`)).toBeVisible();
    await page.keyboard.press('Escape');
    await page.goto(`/app/jardins/${gardenId('canal')}/membres?onglet=invitations`);
    await expect(page.getByTestId(`invitation-${email}`)).toBeVisible();

    const mail = await waitForMail(email, 'Jardin partagé du Canal');
    expect(mail.subject).toContain('chloe');
    const guest = await (await browser.newContext()).newPage();
    await guest.goto(linkFrom(mail.text, '/invitation/'));
    await expect(guest.getByText('Jardin partagé du Canal')).toBeVisible();
    await expect(guest.getByLabel('Adresse e-mail')).toHaveValue(email);
    await guest.getByLabel('Pseudo').fill(uniquePseudo('inv'));
    await guest.getByLabel('Mot de passe').fill('une-phrase-de-passe-solide');
    await guest.getByLabel(/J'accepte les/).check();
    await guest.getByRole('button', { name: 'Créer mon compte' }).click();
    await expect(guest).toHaveURL(new RegExp(`/app/jardins/${gardenId('canal')}$`));
    await expect(guest.getByTestId('garden-title')).toHaveText('Jardin partagé du Canal');
    await guest.goto('/app');
    await expect(guest.getByTestId('verify-banner')).toHaveCount(0);
  });

  test('[GRP-01] création d\'un groupe avec deux membres', async ({ page }) => {
    await login(page, 'bruno');
    await page.goto(`/app/jardins/${gardenId('canal')}/membres?onglet=groupes`);
    await page.getByTestId('group-new').click();
    await page.getByLabel('Nom du groupe').fill('Équipe compost');
    await page.getByRole('dialog').getByText('david', { exact: true }).click();
    await page.getByRole('dialog').getByText('emma', { exact: true }).click();
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    const card = page.getByTestId('group-Équipe compost');
    await expect(card).toBeVisible();
    await expect(card).toContainText('2 membres');
    await expect(card).toContainText('david, emma');
  });
});
