import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { E2E_YEAR, topSpeciesKgByYear } from './db';
import { gardenId } from './ids';
import { login } from './helpers';

const TILLEULS = gardenId('tilleuls');

test.describe('statistiques', () => {
  test('[STAT-01] 3 saisons d\'historique : les rendements par espèce et par zone sont comparés d\'une année à l\'autre', async ({ page }) => {
    // Les Tilleuls : saison au 1er janvier, historique N−2 à N dans le seed.
    const top = await topSpeciesKgByYear(TILLEULS);
    expect(Object.keys(top.kg).length).toBeGreaterThanOrEqual(2);
    await login(page, 'alice');
    await page.goto(`/app/jardins/${TILLEULS}/statistiques`);
    const species = page.getByTestId('stats-species');
    for (const y of [E2E_YEAR - 2, E2E_YEAR - 1, E2E_YEAR]) await expect(species.locator('thead')).toContainText(String(y));
    const row = page.getByTestId(`stats-species-${top.speciesId}`);
    const years = Object.keys(top.kg).map(Number).sort((a, b) => a - b);
    for (const y of years) {
      const shown = Number(((await row.locator(`td[data-season="${y}"]`).textContent()) ?? '').split(' kg')[0]?.replace(/\s/g, '').replace(',', '.'));
      expect(shown, String(y)).toBeCloseTo(top.kg[y] ?? -1, 0);
    }
    // L'évolution par rapport à la saison précédente est affichée (+ ou − en %).
    await expect(row.locator(`td[data-season="${years.at(-1)}"]`)).toContainText('%');
    await expect(page.getByTestId('stats-zones').locator('tbody tr').first()).toBeVisible();
    // Le propriétaire peut exporter ; le bouton est là.
    await expect(page.getByTestId('stats-export')).toBeVisible();
  });

  test('la propriétaire télécharge l\'export CSV des statistiques (E2E-STAT-07b)', async ({ page }) => {
    await login(page, 'alice');
    await page.goto(`/app/jardins/${TILLEULS}/statistiques`);
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('stats-export').click()]);
    expect(download.suggestedFilename()).toBe('statistiques-les-tilleuls.csv');
    const content = readFileSync((await download.path()) ?? '', 'utf8');
    // BOM UTF-8 (accents lisibles dans les tableurs), en-tête, puis au moins une ligne de la saison en cours.
    expect(content.charCodeAt(0)).toBe(0xfeff);
    expect(content.slice(1).split('\n')[0]).toBe('saison;espece;zone;kg;kg_m2;recoltes;autres_unites');
    expect(content).toMatch(new RegExp(`\\n${E2E_YEAR};`));
  });
});
