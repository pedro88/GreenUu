import { expect, test } from '@playwright/test';
import { ticketIdByTitle } from './db';
import { gardenId } from './ids';
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
    for (const path of ['', '/zones', '/membres', '/parametres', '/cultures', '/saisons', '/tickets', `/tickets/${ticketId}`]) {
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
});
