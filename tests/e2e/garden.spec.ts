import { expect, test } from '@playwright/test';
import { gardenId } from './ids';
import { login } from './helpers';

test.describe('jardins et zones', () => {
  test('[GRD-01] création d\'un jardin avec l\'assistant', async ({ page }) => {
    await login(page, 'hugo');
    await page.goto('/app/jardins/nouveau');
    await page.getByTestId('org-family').click();
    await page.getByTestId('wizard-continue').click();
    await page.getByLabel('Nom du jardin').fill('Potager de Hugo');
    await page.getByLabel('Latitude').fill('50.63');
    await page.getByLabel('Longitude').fill('5.57');
    await page.getByTestId('wizard-continue').click();
    await page.getByLabel('Type de sol').selectOption('clay');
    await page.getByTestId('wizard-continue').click();
    await page.getByText('Paillage', { exact: true }).click();
    await page.getByTestId('wizard-continue').click();
    await expect(page).toHaveURL(/\/app\/jardins\/[0-9a-f-]+\/zones\?nouveau=1$/);
    await expect(page.getByTestId('garden-title')).toHaveText('Potager de Hugo');
    await page.goto('/app/jardins');
    await expect(page.getByText('Potager de Hugo')).toBeVisible();
  });

  test('[ZON-01] création de zones imbriquées sur trois niveaux', async ({ page }) => {
    await login(page, 'alice');
    const base = `/app/jardins/${gardenId('tilleuls')}/zones`;
    await page.goto(base);
    await page.getByTestId('add-zone').click();
    await page.getByLabel('Nom').fill('Verger nord');
    await page.getByLabel('Type').selectOption({ label: 'Parcelle' });
    await page.getByRole('button', { name: 'Créer la zone' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Verger nord' })).toBeVisible();
    for (const [name, type] of [['Planche V1', 'Planche'], ['Rang V1-A', 'Rang']] as const) {
      await page.getByRole('button', { name: 'Ajouter une sous-zone' }).click();
      await page.getByLabel('Nom').fill(name);
      await page.getByLabel('Type').selectOption({ label: type });
      await page.getByRole('button', { name: 'Créer la zone' }).click();
      await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
    }
    await page.goto(base);
    const rang = page.getByTestId('zone-tree').locator('li', { hasText: 'Rang V1-A' }).last();
    await expect(rang).toHaveAttribute('data-depth', '2');
  });

  test('[MBR-06] liste des jardins avec le rôle dans chacun', async ({ page }) => {
    await login(page, 'gaelle');
    await page.goto('/app/jardins');
    await expect(page.getByTestId(`garden-card-${gardenId('combes')}`).getByTestId('garden-role')).toHaveText('Propriétaire');
    await expect(page.getByTestId(`garden-card-${gardenId('canal')}`).getByTestId('garden-role')).toHaveText('Membre');
    await expect(page.getByTestId(`garden-card-${gardenId('tilleuls')}`).getByTestId('garden-role')).toHaveText('Observateur·rice');
  });
});
