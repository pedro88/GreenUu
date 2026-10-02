import { expect, test } from '@playwright/test';
import { gardenId } from './ids';
import { login } from './helpers';

const TILLEULS = gardenId('tilleuls');
const CANAL = gardenId('canal');

test.describe('progression', () => {
  test('[XP-02] une récolte de 2 kg affiche « +8 XP », puis le profil et le journal d\'XP la montrent', async ({ page }) => {
    await login(page, 'alice');
    await page.goto('/app/profil');
    const before = Number((await page.getByTestId('profile-xp').innerText()).replace(/\D/g, ''));
    await page.goto(`/app/jardins/${TILLEULS}/cultures`);
    await page.getByTestId('culture-list').getByRole('link', { name: /Tomate Noire de Crimée/ }).first().click();
    await page.getByTestId('quick-open').click();
    await page.getByTestId('quick-harvest').click();
    const dialog = page.getByRole('dialog');
    await dialog.getByTestId('quick-qty-input').fill('2');
    await dialog.getByTestId('quick-harvest-save').click();
    await expect(dialog.getByTestId('quick-xp')).toHaveText('+8 XP');
    await page.keyboard.press('Escape');
    await page.goto('/app/profil');
    await expect(page.getByTestId('profile-xp')).toHaveText(`${(before + 8).toLocaleString('fr-FR')} XP`.replace(/ /g, ' '));
    await page.goto('/app/profil/xp');
    await expect(page.getByTestId('xp-ledger').locator('li[data-code="harvest.recorded"]').first()).toContainText('+8');
  });

  test('[ACH-05] la page des succès date les succès obtenus et montre l\'avancement des verrouillés', async ({ page }) => {
    await login(page, 'alice');
    await page.goto('/app/profil/succes');
    await expect(page.getByTestId('achievement-first_harvest')).toHaveAttribute('data-earned', 'true');
    await expect(page.getByTestId('achievement-first_harvest')).toContainText(/obtenu le \d{1,2} \S+ \d{4}/);
    await expect(page.getByTestId('achievement-useful_tips_10')).toHaveAttribute('data-earned', 'false');
    await expect(page.getByTestId('achievement-progress-useful_tips_10')).toHaveText(/^À débloquer · \d+ \/ 10$/);
  });

  test('[COL-01] le tableau des contributions d\'un jardin collectif est trié par ordre alphabétique, sans rang', async ({ page }) => {
    await login(page, 'bruno');
    await page.goto(`/app/jardins/${CANAL}/membres?onglet=contributions`);
    const names = await page.getByTestId('contributions').locator('tbody th').allInnerTexts();
    expect(names.length).toBeGreaterThanOrEqual(5);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'fr')));
    await expect(page.getByTestId('contributions').locator('thead')).not.toContainText(/rang|classement/i);
    await expect(page.getByTestId('leaderboard')).toHaveCount(0);
  });
});
