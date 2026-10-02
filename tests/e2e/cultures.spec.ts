import { expect, test, type Page } from '@playwright/test';
import { hasExif, imageSize, sniffImage } from '../../src/lib/images';
import { gardenId, zoneId } from './ids';
import { login } from './helpers';

const TILLEULS = gardenId('tilleuls');

async function openCulture(page: Page, label: string) {
  await page.goto(`/app/jardins/${TILLEULS}/cultures`);
  await page.getByTestId('culture-list').getByRole('link', { name: new RegExp(label) }).first().click();
  await expect(page.getByTestId('culture-title')).toHaveText(label);
}

test.describe('cultures, journal, récoltes', () => {
  test('[JRN-01] observation avec 2 photos : photos ≤ 1600 px et sans EXIF', async ({ page }) => {
    await login(page, 'alice');
    await openCulture(page, 'Tomate Noire de Crimée');
    await page.getByTestId('quick-open').click();
    await page.getByTestId('quick-note').fill('Belles grappes, quelques feuilles jaunes en bas.');
    await page.getByTestId('quick-file').setInputFiles(['tests/e2e/fixtures/photo-gps.jpg', 'tests/e2e/fixtures/photo-small.jpg']);
    await page.getByTestId('quick-save').click();
    await expect(page.getByTestId('quick-done')).toBeVisible();
    await page.keyboard.press('Escape');
    const photos = page.getByTestId('journal-photo');
    await expect(photos).toHaveCount(2);
    for (const src of await photos.evaluateAll((els) => els.map((e) => e.getAttribute('src') ?? ''))) {
      const res = await page.request.get(src);
      expect(res.ok()).toBe(true);
      const buf = new Uint8Array(await res.body());
      const mime = sniffImage(buf);
      expect(mime).toBe('image/jpeg');
      const size = mime ? imageSize(buf, mime) : null;
      expect(Math.max(size?.width ?? 9999, size?.height ?? 9999)).toBeLessThanOrEqual(1600);
      expect(hasExif(buf)).toBe(false);
    }
  });

  test('[JRN-08] récolte en 2 taps, champs obligatoires limités à quantité et unité', async ({ page }) => {
    await login(page, 'alice');
    await openCulture(page, 'Tomate Noire de Crimée');
    await page.getByTestId('quick-open').click();
    await page.getByTestId('quick-harvest').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByTestId('quick-qty-input')).toBeVisible();
    await expect(dialog.getByLabel('Unité')).toBeVisible();
    await dialog.getByLabel('Plus').click();
    await dialog.getByLabel('Plus').click();
    await expect(dialog.getByTestId('quick-qty')).toHaveText('1.2 kg');
    await dialog.getByTestId('quick-harvest-save').click();
    await expect(dialog.getByTestId('quick-done')).toHaveText('Récolte enregistrée !');
    await page.keyboard.press('Escape');
    await page.getByRole('link', { name: 'Récoltes' }).click();
    await expect(page.getByTestId('harvests')).toContainText('1,2 kg');
  });

  test('[ROT-06] la frise des saisons montre les familles et le retour trop précoce', async ({ page }) => {
    await login(page, 'alice');
    await page.goto(`/app/jardins/${TILLEULS}/saisons`);
    const grid = page.getByTestId('season-grid');
    await expect(grid).toBeVisible();
    const row = grid.getByRole('row', { name: /Planche 1/ });
    await expect(row.getByTestId('rotation-early')).toContainText('Noire de Crimée');
    await expect(row.getByTestId('rotation-ok').filter({ hasText: 'Tomate Cœur de bœuf' })).toHaveCount(1);
  });

  test('[PLT-02] variété proposée : en attente dans le jardin, absente ailleurs, visible en modération', async ({ page, browser }) => {
    await login(page, 'alice');
    await page.goto(`/app/plantes/proposer?jardin=${TILLEULS}`);
    await page.getByLabel('Espèce').selectOption({ label: 'Tomate' });
    await page.getByLabel('Nom de la variété').fill('Tomate de Marmande locale');
    await page.getByRole('button', { name: 'Proposer' }).click();
    await expect(page.getByTestId('propose-sent')).toBeVisible();
    await page.goto(`/app/jardins/${TILLEULS}/cultures/nouvelle`);
    await page.getByTestId('plant-search').fill('marmande locale');
    await expect(page.getByText('Variété en attente de validation')).toBeVisible();

    const hugo = await (await browser.newContext()).newPage();
    await login(hugo, 'hugo');
    await hugo.goto('/app/plantes?q=marmande%20locale');
    await expect(hugo.getByText('Tomate de Marmande locale')).toHaveCount(0);

    const modo = await (await browser.newContext()).newPage();
    await login(modo, 'modo');
    await modo.goto('/admin/varietes');
    await expect(modo.getByTestId('pending-Tomate Tomate de Marmande locale')).toBeVisible();
  });

  test('[ZON-09] archiver une zone avec une culture en cours demande de la terminer', async ({ page }) => {
    await login(page, 'alice');
    await page.goto(`/app/jardins/${TILLEULS}/zones/${zoneId('tilleuls', 'bac3')}`);
    await page.getByTestId('zone-archive').click();
    await page.getByTestId('zone-archive-confirm').click();
    await expect(page.getByTestId('zone-has-cultures')).toBeVisible();
    await page.getByRole('button', { name: 'Annuler' }).click();
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Bac 3' })).toBeVisible();
    await page.getByTestId('zone-archive').click();
    await page.getByTestId('zone-archive-confirm').click();
    await page.getByTestId('zone-archive-finish').click();
    await expect(page).toHaveURL(new RegExp(`/app/jardins/${TILLEULS}/zones$`));
  });
});
