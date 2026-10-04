import { expect, test } from '@playwright/test';
import { freshGarden } from './db';
import { login } from './helpers';

/* Distances et densité de plantation (SPEC RG-CUL-06, §12.10) : saisies dans l'assistant, enregistrées, affichées. */

test('[PLA-01] des tomates plantées aux distances de l\'espèce sur 2 m² : 5 plants estimés, enregistrés et affichés sur la fiche', async ({ page }) => {
  const { gardenId } = await freshGarden('hugo');
  await login(page, 'hugo');
  await page.goto(`/app/jardins/${gardenId}/cultures/nouvelle`);
  await page.getByTestId('plant-search').fill('tomate');
  await page.getByTestId('hit-species-Tomate').click();
  await page.getByRole('button', { name: 'Continuer' }).click();
  // Distances pré-remplies avec celles de l'espèce (50 × 80 cm).
  await expect(page.getByTestId('spacing-plant')).toHaveValue('50');
  await expect(page.getByTestId('spacing-row')).toHaveValue('80');
  await page.getByTestId('culture-area').fill('2');
  await expect(page.getByTestId('density-estimate')).toHaveText('≈ 5 plants sur cette surface');
  await page.getByRole('button', { name: 'Vérifier' }).click();
  await page.getByTestId('create-culture').click();
  await expect(page.getByTestId('culture-title')).toBeVisible();
  await expect(page.getByTestId('culture-planting')).toHaveText('50 cm entre les plants, 80 cm entre les rangs · 5 plants');
});
