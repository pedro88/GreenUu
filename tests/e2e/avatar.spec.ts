import { expect, test } from '@playwright/test';
import { avatarRow, decorPracticeCode } from './db';
import { decorId, gardenId, userId, zoneId } from './ids';
import { login } from './helpers';

const CANAL = gardenId('canal');

test.describe('éditeur d\'avatar (§10)', () => {
  test('[AVT-01] changer de coiffure et de couleur de cheveux, puis enregistrer : nouveau config_hash et vignette à jour dans les membres', async ({ page }) => {
    const before = await avatarRow(userId('emma'));
    await login(page, 'emma');
    await page.goto('/app/profil/avatar');
    const editor = page.getByTestId('avatar-editor');
    await expect(editor).toHaveAttribute('data-config-hash', before?.configHash ?? /./);
    await page.getByTestId('avatar-tab-hair').click();
    const hair = before?.config.layers.hair_front?.item === 'hair_bun' ? 'hair_long' : before?.config.layers.hair_front?.item === 'hair_long' ? 'hair_curly' : 'hair_long';
    const color = before?.config.layers.hair_front?.palettes[0] === 'hair_copper' ? 'hair_violet' : 'hair_copper';
    await page.getByTestId(`avatar-item-${hair}`).click();
    await expect(page.getByTestId(`avatar-item-${hair}`)).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId(`avatar-palette-${color}`).click();
    await page.getByTestId('avatar-save').click();
    await expect(page.getByTestId('avatar-hint')).toHaveText('Avatar enregistré.');
    await expect.poll(async () => (await avatarRow(userId('emma')))?.configHash).not.toBe(before?.configHash);
    const after = await avatarRow(userId('emma'));
    expect(after?.config.layers.hair_front).toEqual({ item: hair, palettes: [color] });
    await expect(editor).toHaveAttribute('data-config-hash', after?.configHash ?? '');

    // La vignette des membres est recomposée pour le nouveau hash, sans télécharger l'atlas (audit lot 8, M1).
    const sprites: string[] = [];
    page.on('request', (r) => { if (r.url().includes('/sprites/')) sprites.push(new URL(r.url()).pathname); });
    await page.goto(`/app/jardins/${CANAL}/membres`);
    const thumb = page.getByTestId('member-emma').getByTestId('avatar-thumb');
    await expect(thumb).toHaveAttribute('data-config-hash', after?.configHash ?? '');
    await expect(thumb).toHaveAttribute('data-state', 'composed');
    await expect(thumb.locator('img')).toHaveCount(1);
    expect(sprites.filter((p) => p.startsWith('/sprites/atlas/'))).toEqual([]);
    expect(sprites.some((p) => p.startsWith('/sprites/avatar/'))).toBe(true);
  });

  test('[AVT-02] une configuration forgée qui équipe le chapeau de paille verrouillé : LOCKED_ITEM, rien ne change, « Succès Semencier » affiché', async ({ page }) => {
    const before = await avatarRow(userId('alice'));
    await login(page, 'alice');
    await page.goto('/app/profil/avatar');
    await page.getByTestId('avatar-tab-headwear').click();
    const straw = page.getByTestId('avatar-item-hat_straw');
    await expect(straw).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId('avatar-lock-hat_straw')).toHaveText('Succès Semencier');
    // Le tap n'équipe rien : il explique la condition.
    await straw.click({ force: true }); // aria-disabled : Playwright refuse sinon le tap qui affiche la condition
    await expect(straw).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('avatar-hint')).toContainText('Succès Semencier');

    // Configuration forgée : l'appel de l'action est réécrit pour équiper le chapeau verrouillé.
    await page.route('**/app/profil/avatar', async (route) => {
      const req = route.request();
      if (req.method() !== 'POST' || !req.headers()['next-action']) return route.continue();
      const body = JSON.parse(req.postData() ?? '[]') as [{ config: { layers: Record<string, unknown> } }]; // as: arguments sérialisés de la Server Action
      body[0].config.layers.headwear = { item: 'hat_straw', palettes: ['straw'] };
      return route.continue({ postData: JSON.stringify(body) });
    });
    await page.getByTestId('avatar-item-hat_beanie').click();
    await page.getByTestId('avatar-save').click();
    await expect(page.getByText('Cet élément n’est pas encore débloqué : rien n’a été enregistré.')).toBeVisible();
    expect((await avatarRow(userId('alice')))?.configHash).toBe(before?.configHash);
    await expect(page.getByTestId('avatar-editor')).toHaveAttribute('data-config-hash', before?.configHash ?? '');
    await expect(page.getByTestId('avatar-lock-hat_straw')).toHaveText('Succès Semencier');
  });

  test('[AVT-07] « Annuler » rétablit la dernière configuration enregistrée', async ({ page }) => {
    await login(page, 'chloe');
    await page.goto('/app/profil/avatar');
    const editor = page.getByTestId('avatar-editor');
    await page.getByTestId('avatar-tab-hair').click();
    const saved = await page.locator('[data-testid^="avatar-item-"][aria-pressed="true"]').getAttribute('data-testid');
    const other = saved === 'avatar-item-hair_short' ? 'avatar-item-hair_curly' : 'avatar-item-hair_short';
    await page.getByTestId(other).click();
    await page.getByTestId('avatar-tab-top').click();
    await page.getByTestId('avatar-palette-plum').click();
    await expect(editor).toHaveAttribute('data-dirty', 'true');
    await page.getByTestId('avatar-cancel').click();
    await expect(editor).toHaveAttribute('data-dirty', 'false');
    await page.getByTestId('avatar-tab-hair').click();
    await expect(page.getByTestId(saved ?? '')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId(other)).toHaveAttribute('aria-pressed', 'false');
    // Rien n'a été envoyé : la page rechargée montre la même configuration.
    await page.reload();
    await page.getByTestId('avatar-tab-hair').click();
    await expect(page.getByTestId(saved ?? '')).toHaveAttribute('aria-pressed', 'true');
  });

  test('l\'onboarding commence par l\'avatar, puis l\'assistant du premier jardin', async ({ page }) => {
    await login(page, 'hugo');
    await page.goto('/bienvenue');
    await expect(page.getByTestId('avatar-editor')).toBeVisible();
    await page.getByTestId('welcome-avatar-continue').click();
    await expect(page.getByTestId('wizard-continue')).toBeVisible();
  });
});

test.describe('jardin collectif (§9.5, §8.7)', () => {
  test('[COL-04] un membre qui vient d\'agir apparaît près de la zone de sa dernière action', async ({ page, browser }) => {
    const emma = await (await browser.newContext()).newPage();
    await login(emma, 'emma');
    await emma.goto(`/app/jardins/${CANAL}/tickets/nouveau`);
    await emma.getByLabel('Titre').fill(`Retourner le compost ${Date.now().toString(36)}`);
    await emma.getByLabel('Rattachée à').selectOption({ label: 'Compost collectif' });
    await emma.getByTestId('ticket-submit').click();
    await expect(emma.getByTestId('ticket-title')).toBeVisible();

    await login(page, 'bruno');
    await page.goto(`/app/jardins/${CANAL}?vue=jardin`);
    await expect(page.getByTestId('garden-view')).toHaveAttribute('data-canvas', 'ready');
    const avatar = page.getByTestId(`avatar-${userId('emma')}`);
    const compost = zoneId('canal', 'compost');
    await expect(avatar).toHaveAttribute('data-zone-id', compost);
    await expect(avatar).toHaveAttribute('aria-label', 'emma, près de Compost collectif');
    // Près de la zone : son repère touche le rectangle de la zone à l'écran.
    const a = await avatar.boundingBox();
    const z = await page.getByTestId(`zone-${compost}`).boundingBox();
    if (!a || !z) throw new Error('repères absents');
    const cx = a.x + a.width / 2;
    const foot = a.y + a.height;
    expect(cx).toBeGreaterThanOrEqual(z.x - 1);
    expect(cx).toBeLessThanOrEqual(z.x + z.width + 1);
    expect(Math.abs(foot - (z.y + z.height))).toBeLessThan(a.height);
    // La liste textuelle l'annonce aussi.
    await expect(page.getByTestId(`avatar-item-${userId('emma')}`)).toHaveText('emma, près de Compost collectif');
  });

  test('un objet ★ posé se déclare comme pratique depuis sa feuille', async ({ page }) => {
    const nichoir = decorId('canal', 'nichoir');
    expect(await decorPracticeCode(nichoir)).toBeNull();
    await login(page, 'bruno');
    await page.goto(`/app/jardins/${CANAL}?vue=jardin`);
    await page.getByTestId(`decor-${nichoir}`).click();
    await expect(page.getByTestId('scene-sheet')).toContainText('Nichoir');
    await page.getByTestId('decor-declare').click();
    await expect(page.getByTestId('decor-practice-declared')).toBeVisible();
    expect(await decorPracticeCode(nichoir)).toBe('biodiversity_birdhouse');
    await expect(page.getByTestId(`decor-${nichoir}`)).toHaveAttribute('data-state', 'practice');
  });

  test('la page de progression montre le niveau du jardin, ses objectifs et les succès des membres', async ({ page }) => {
    await login(page, 'david');
    await page.goto(`/app/jardins/${CANAL}/progression`);
    await expect(page.getByTestId('garden-level')).toContainText('Niveau');
    await expect(page.getByTestId('garden-xp')).toContainText('XP');
    await expect(page.getByText('Succès collectifs')).toBeVisible();
  });
});
