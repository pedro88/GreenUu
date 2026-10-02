import { expect, test } from '@playwright/test';
import { E2E_YEAR, guideIdByTitle, tipContext } from './db';
import { gardenId } from './ids';
import { login } from './helpers';

const TILLEULS = gardenId('tilleuls');

test.describe('guides, tips, modération', () => {
  test('[GUI-01] un guide publié en public est lisible sans compte, et un <script> du Markdown ne s\'exécute pas', async ({ page, browser }) => {
    const title = `Tomates cerises sur balcon ${Date.now().toString(36)}`;
    await login(page, 'alice');
    await page.goto('/app/guides/nouveau');
    await page.getByLabel('Titre').fill(title);
    await page.getByLabel('Espèce').selectOption({ label: 'Tomate' });
    await page.getByTestId('guide-body').fill('## Semis\nSemer en mars.\n\n<script>window.__pwned = true</script>\n\n<img src=x onerror="window.__pwned = true">');
    await page.getByTestId('guide-save-publish').click();
    await expect(page.getByTestId('guide-title')).toHaveText(title);
    await expect(page.getByTestId('guide-version')).toHaveText('v1');

    const anonymous = await (await browser.newContext()).newPage();
    await anonymous.goto('/guides-publics');
    await anonymous.getByRole('link', { name: title }).click();
    await expect(anonymous).toHaveURL(/\/guides-publics\/tomates-cerises-sur-balcon-/);
    await expect(anonymous.getByTestId('guide-title')).toHaveText(title);
    await expect(anonymous.getByTestId('markdown').getByRole('heading', { name: 'Semis' })).toBeVisible();
    await expect(anonymous.locator('[data-testid="markdown"] script, [data-testid="markdown"] img')).toHaveCount(0);
    expect(await anonymous.evaluate(() => (window as unknown as { __pwned?: boolean }).__pwned)).toBeUndefined(); // as: sonde posée par la charge utile
  });

  test('[GUI-06] un jardinier adapte le guide public d\'une autre : brouillon copié, « adapté de … (v n) », compteur de forks à la publication', async ({ page }) => {
    const original = await guideIdByTitle('Réussir ses fraisiers en climat océanique');
    await login(page, 'bruno');
    await page.goto(`/app/guides/${original}`);
    await expect(page.getByTestId('guide-forks')).toHaveText('Aucun fork public');
    await page.getByTestId('guide-fork').click();
    await expect(page).toHaveURL(/\/edition$/);
    await expect(page.getByLabel('Titre')).toHaveValue('Réussir ses fraisiers en climat océanique');
    await page.getByLabel('Titre').fill('Fraisiers du jardin partagé');
    await page.getByTestId('guide-save-publish').click();
    await expect(page.getByTestId('guide-title')).toHaveText('Fraisiers du jardin partagé');
    await expect(page.getByTestId('guide-origin')).toHaveText('Adapté de « Réussir ses fraisiers en climat océanique » (v1)');
    await page.goto(`/app/guides/${original}`);
    await expect(page.getByTestId('guide-forks')).toHaveText('1 fork public');
  });

  test('[GUI-08] appliquer un guide à calendrier type depuis la fiche culture crée les tâches aux bonnes échéances', async ({ page }) => {
    await login(page, 'alice');
    await page.goto(`/app/jardins/${TILLEULS}/cultures`);
    await page.getByTestId('culture-list').getByRole('link', { name: /Tomate Noire de Crimée/ }).first().click();
    await page.getByTestId('guide-apply-open').click();
    await page.getByTestId('guide-apply-choice').selectOption({ label: 'Tomates en climat océanique (v2)' });
    await page.getByTestId('guide-apply-anchor').fill(`${E2E_YEAR}-03-01`);
    await page.getByTestId('guide-apply-submit').click();
    await expect(page.getByTestId('guide-applied')).toHaveText('Guide appliqué : 2 tâches créées.');
    await page.keyboard.press('Escape');
    await page.reload();
    await expect(page.getByTestId('culture-applied-guide')).toHaveText('Guide appliqué : Tomates en climat océanique (v2)');
    await page.goto(`${page.url().split('?')[0] ?? ''}?onglet=taches`);
    // Plantation réelle le 17 mai : tuteurer à +7 j, pailler à +14 j (les dates réelles priment).
    await expect(page.getByRole('link', { name: /Tuteurer les tomates/ })).toContainText('24 mai');
    await expect(page.getByRole('link', { name: /Pailler le pied des tomates/ })).toContainText('31 mai');
  });

  test('[TIP-01] un tip de 120 caractères avec 2 tags prend le contexte du jardin et apparaît dans le fil', async ({ page }) => {
    const body = `Semer la phacélie après les pommes de terre couvre le sol et nourrit les abeilles jusqu'aux gelées ${Date.now().toString(36)}`.slice(0, 120);
    await login(page, 'alice');
    await page.goto('/app/tips');
    await page.getByTestId('tip-share').click();
    await page.getByTestId('tip-body').fill(body);
    await page.getByTestId('tip-tags').fill('engrais vert, Abeilles');
    await expect(page.getByTestId('tip-context')).toHaveValue(TILLEULS);
    await page.getByTestId('tip-submit').click();
    await expect(page.getByTestId('tip-published')).toBeVisible();
    await page.keyboard.press('Escape');
    const item = page.getByTestId('tip-feed').locator('li', { hasText: body });
    await expect(item).toBeVisible();
    await expect(item.getByRole('link', { name: 'engrais-vert' })).toBeVisible();
    await expect(item.getByRole('link', { name: 'abeilles' })).toBeVisible();
    const ctx = await tipContext(body);
    expect(ctx?.geohash4).toMatch(/^[0-9b-hjkmnp-z]{4}$/);
    expect(ctx?.koppen).toBe('Cfb');
  });

  test('[MOD-03] un utilisateur ordinaire voit la page 403 sur /admin et ses sous-pages', async ({ page }) => {
    await login(page, 'alice');
    for (const path of ['/admin', '/admin/signalements', '/admin/varietes']) {
      await page.goto(path);
      await expect(page.getByTestId('page-403'), path).toBeVisible();
      await expect(page.getByTestId('report-queue'), path).toHaveCount(0);
    }
  });
});
