import { expect, test } from '@playwright/test';
import { ticketCount, ticketIdByTitle } from './db';
import { gardenId, zoneId } from './ids';
import { login } from './helpers';

const CANAL = gardenId('canal');
const TILLEULS = gardenId('tilleuls');
const TICKET = "Réparer le récupérateur d'eau";

/**
 * E2E-AUTHZ-01 : un refus se prouve avec une session réelle et une navigation directe. Les Server Actions
 * sont couvertes par AUTHZ-02 et AUTHZ-03 (intégration) ; ici, le câblage des routes et des gardes de page.
 */
test.describe('contrôle d\'accès par URL directe', () => {
  test('[AUTHZ-01] un non-membre voit la page 403 sur chaque page du jardin, sans aucune donnée', async ({ page }) => {
    const ticketId = await ticketIdByTitle(CANAL, TICKET);
    await login(page, 'hugo');
    for (const path of ['', '/plan', '/zones', '/membres', '/parametres', '/cultures', '/saisons', '/tickets', `/tickets/${ticketId}`]) {
      await page.goto(`/app/jardins/${CANAL}${path}`);
      await expect(page.getByTestId('page-403'), path).toBeVisible();
      await expect(page.locator('body'), path).not.toContainText('Canal');
      await expect(page.locator('body'), path).not.toContainText('récupérateur');
    }
  });

  test('[AUTHZ-03] un ticket d\'un autre jardin dont on est membre donne 404 sous l\'URL de son propre jardin', async ({ page }) => {
    const ticketId = await ticketIdByTitle(CANAL, TICKET);
    await login(page, 'gaelle');
    await page.goto(`/app/jardins/${TILLEULS}/tickets/${ticketId}`);
    await expect(page.getByTestId('page-404')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('récupérateur');
    await expect(page.locator('body')).not.toContainText("J'apporte un nouveau robinet");
    // Témoin positif : la même personne lit ce ticket sous l'URL de son jardin.
    await page.goto(`/app/jardins/${CANAL}/tickets/${ticketId}`);
    await expect(page.getByTestId('ticket-title')).toHaveText(TICKET);
  });

  /**
   * E2E-AUTHZ-02 : l'UI ne propose pas les actions refusées (AUTHZ-07 pour l'observateur, §5.3 pour la zone
   * restreinte). Les refus côté serveur sont couverts par AUTHZ-04, 05 et 07 (intégration).
   */
  test('[AUTHZ-07] l\'observatrice ne se voit proposer ni création, ni statut, ni commentaire, ni saisie', async ({ page }) => {
    const ticketId = await ticketIdByTitle(TILLEULS, 'Nettoyer les outils');
    await login(page, 'gaelle');
    await page.goto(`/app/jardins/${TILLEULS}/tickets`);
    await expect(page.getByTestId('garden-title')).toBeVisible();
    await expect(page.getByTestId('new-ticket')).toHaveCount(0);
    await page.goto(`/app/jardins/${TILLEULS}/tickets/${ticketId}`);
    await expect(page.getByTestId('ticket-title')).toHaveText('Nettoyer les outils');
    for (const id of ['status-done', 'status-in_progress', 'comment-body', 'assign-open', 'edit-open']) await expect(page.getByTestId(id), id).toHaveCount(0);
    await page.goto(`/app/jardins/${TILLEULS}/tickets/nouveau`);
    await expect(page.getByTestId('page-403')).toBeVisible();
    await page.goto(`/app/jardins/${TILLEULS}/cultures`);
    await page.getByTestId('culture-list').getByRole('link', { name: /Tomate Noire de Crimée/ }).first().click();
    await expect(page.getByTestId('culture-title')).toHaveText('Tomate Noire de Crimée');
    await expect(page.getByTestId('quick-open')).toHaveCount(0);
  });

  test('[AUTHZ-01] une scène intérieure d\'un autre jardin donne 404, sans rien révéler de ce jardin (E2E-AUTHZ-01b)', async ({ page }) => {
    await login(page, 'bruno');
    await page.goto(`/app/jardins/${CANAL}?vue=jardin&scene=${zoneId('combes', 'serre1')}`);
    await expect(page.getByTestId('page-404')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('Serre 1');
    await expect(page.locator('body')).not.toContainText('Maraîchage des Combes');
  });

  test('[AUTHZ-05] hors du groupe d\'une zone restreinte : lecture et commentaire, ni statut ni assignation, création refusée', async ({ page }) => {
    const ticketId = await ticketIdByTitle(CANAL, 'Désherber la parcelle Dupont');
    await login(page, 'david');
    await page.goto(`/app/jardins/${CANAL}/tickets/${ticketId}`);
    await expect(page.getByTestId('ticket-title')).toHaveText('Désherber la parcelle Dupont');
    await expect(page.getByTestId('comment-body')).toBeVisible();
    for (const id of ['status-done', 'status-in_progress', 'assign-open', 'edit-open']) await expect(page.getByTestId(id), id).toHaveCount(0);
    const title = `Intrusion Dupont ${Date.now().toString(36)}`;
    await page.goto(`/app/jardins/${CANAL}/tickets/nouveau`);
    await page.getByLabel('Titre').fill(title);
    await page.getByLabel('Rattachée à').selectOption({ label: 'Parcelle Dupont' });
    await page.getByTestId('ticket-submit').click();
    await expect(page.getByTestId('ticket-form').getByRole('alert')).toBeVisible();
    await expect(page).toHaveURL(/\/tickets\/nouveau$/);
    expect(await ticketCount(CANAL, title)).toBe(0);
  });
});
