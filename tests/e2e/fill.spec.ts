import { expect, test, type Page } from '@playwright/test';
import { freshGarden } from './db';
import { login } from './helpers';

/* Remplissage des parcelles (SPEC §12.11) : les plants d'une culture, dessinés et annoncés. */

/** Une culture de tomates en plants achetés, créée par l'assistant, avec son nombre de plants. */
async function plantTomatoes(page: Page, gardenId: string, count: number) {
  await page.goto(`/app/jardins/${gardenId}/cultures/nouvelle`);
  await page.getByTestId('plant-search').fill('tomate');
  await page.getByTestId('hit-species-Tomate').click();
  await page.getByRole('button', { name: 'Continuer' }).click();
  await page.getByTestId('plant-count').fill(String(count));
  await page.getByRole('button', { name: 'Vérifier' }).click();
  await page.getByTestId('create-culture').click();
  await expect(page.getByTestId('culture-title')).toBeVisible();
}

test('[FIL-01] [FIL-05] 8 tomates seules remplissent la planche de 2 × 3 m, hors rangée du bas (20 plants dessinés, 8 annoncés) ; avec 60 plants de plus, la planche reste remplie et chaque culture est un seul élément accessible', async ({ page }) => {
  const { gardenId } = await freshGarden('hugo');
  await login(page, 'hugo');
  await plantTomatoes(page, gardenId, 8);
  await page.goto(`/app/jardins/${gardenId}?vue=jardin`);
  await expect(page.getByTestId('garden-view')).toHaveAttribute('data-canvas', 'ready');
  const cultures = page.locator('[data-testid^="culture-"][data-plants]');
  await expect(cultures).toHaveCount(1);
  // 4 × 5 tuiles : la rangée du bas (le bord en bois) ne reçoit pas de plants.
  await expect(cultures).toHaveAttribute('data-plants', '20');
  await expect(cultures).toHaveAttribute('aria-label', /, 8 plants/);

  await plantTomatoes(page, gardenId, 60);
  await page.goto(`/app/jardins/${gardenId}?vue=jardin`);
  await expect(cultures).toHaveCount(2);
  await expect(page.locator('[data-testid^="culture-"][aria-label*="60 plants"]')).toHaveCount(1);
  // Les deux bandes se partagent la planche : toujours environ un plant par tuile.
  const drawn = await cultures.evaluateAll((els) => els.reduce((s, e) => s + Number(e.getAttribute('data-plants')), 0));
  expect(drawn).toBeGreaterThanOrEqual(18);
  expect(drawn).toBeLessThanOrEqual(22);
});
