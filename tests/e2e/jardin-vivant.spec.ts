import { expect, test } from '@playwright/test';
import { decorAtPosition, freshGarden, terrainCells } from './db';
import { gardenId, userId } from './ids';
import { login, sceneReady, strokeTiles } from './helpers';

/*
 * Jardin vivant (SPEC §9, §12.10) : terrain peint case par case, vocabulaire de l'éditeur, saisons du terrain et avatars
 * qui rejouent leur dernière action. Chaque test d'édition a son propre jardin : les versions du plan ne croisent pas
 * celles des autres tests.
 */

test.describe('terrain peint', () => {
  test('[PNT-01] une allée en L de 8 cases peinte au pinceau est enregistrée, et la vue la dessine avec ses transitions', async ({ page }) => {
    const { gardenId: id } = await freshGarden('hugo');
    await login(page, 'hugo');
    await page.goto(`/app/jardins/${id}/plan`);
    await sceneReady(page, 'plan-editor');
    await page.getByTestId('tool-terrain').click();
    await page.getByRole('button', { name: 'Allée en terre' }).click();
    await expect(page.getByTestId('terrain-mode-brush')).toHaveAttribute('aria-pressed', 'true');
    // Sous la planche : 3 cases vers le bas, puis 5 vers la droite (8 cases en tout).
    await strokeTiles(page, [{ x: 1, y: 9 }, { x: 1, y: 11 }, { x: 6, y: 11 }]);
    await expect(page.getByTestId('plan-editor')).toHaveAttribute('data-status', 'saved', { timeout: 15_000 });
    await expect.poll(() => terrainCells(id)).toHaveLength(8);
    const cells = await terrainCells(id);
    expect(cells.every((c) => c.kind === 'path')).toBe(true);
    expect(cells.map((c) => `${c.x},${c.y}`)).toEqual(['1,9', '1,10', '1,11', '2,11', '3,11', '4,11', '5,11', '6,11']);

    await page.goto(`/app/jardins/${id}?vue=jardin`);
    await sceneReady(page);
    // Bords arrondis : des tuiles de transition dual-grid, et pas seulement des tuiles pleines.
    await expect.poll(async () => Number(await page.getByTestId('garden-view').getAttribute('data-terrain-transitions'))).toBeGreaterThan(8);
  });

  test('[PNT-05] deux sessions peignent le même plan : la seconde reçoit CONFLICT, recharge et rejoue sa peinture sans perte', async ({ page, browser }) => {
    const { gardenId: id } = await freshGarden('hugo');
    await login(page, 'hugo');
    const other = await (await browser.newContext()).newPage();
    await login(other, 'hugo');
    for (const p of [page, other]) {
      await p.goto(`/app/jardins/${id}/plan`);
      await sceneReady(p, 'plan-editor');
      await p.getByTestId('tool-terrain').click();
    }
    const version = Number(await page.getByTestId('plan-editor').getAttribute('data-plan-version'));
    await page.getByRole('button', { name: 'Allée de gravier' }).click();
    await strokeTiles(page, [{ x: 0, y: 12 }, { x: 2, y: 12 }]);
    await expect(page.getByTestId('plan-editor')).toHaveAttribute('data-plan-version', String(version + 1), { timeout: 15_000 });
    // La seconde session, restée sur l'ancienne version, peint la mare.
    await other.getByRole('button', { name: 'Eau (mare, bassin)' }).click();
    await strokeTiles(other, [{ x: 8, y: 2 }, { x: 9, y: 2 }]);
    await expect(other.getByTestId('plan-editor')).toHaveAttribute('data-plan-version', String(version + 2), { timeout: 20_000 });
    await expect(other.getByTestId('plan-conflicts')).toHaveCount(0);
    const cells = await terrainCells(id);
    expect(cells.filter((c) => c.kind === 'gravel_path')).toHaveLength(3);
    expect(cells.filter((c) => c.kind === 'water')).toHaveLength(2);
  });
});

test.describe('terrain peint : gestes et refus (audit e2e jardin vivant)', () => {
  test('rectangle, gomme de terrain et pipette : les cases enregistrées suivent les gestes (E2E-PNT-08)', async ({ page }) => {
    const { gardenId: id } = await freshGarden('hugo');
    await login(page, 'hugo');
    await page.goto(`/app/jardins/${id}/plan`);
    await sceneReady(page, 'plan-editor');
    const editor = page.getByTestId('plan-editor');
    await page.getByTestId('tool-terrain').click();
    await page.getByRole('button', { name: 'Allée de gravier' }).click();
    await page.getByTestId('terrain-mode-rect').click();
    await strokeTiles(page, [{ x: 0, y: 12 }, { x: 2, y: 13 }]);
    await expect(editor).toHaveAttribute('data-status', 'saved', { timeout: 15_000 });
    await expect.poll(() => terrainCells(id)).toHaveLength(6);
    await page.getByTestId('terrain-mode-erase').click();
    await strokeTiles(page, [{ x: 1, y: 12 }]);
    await expect.poll(() => terrainCells(id)).toHaveLength(5);
    // La pipette reprend le type de la case touchée, puis rend la main au pinceau.
    await page.getByRole('button', { name: 'Eau (mare, bassin)' }).click();
    await page.getByTestId('terrain-mode-pick').click();
    await strokeTiles(page, [{ x: 0, y: 13 }]);
    await expect(page.getByTestId('terrain-mode-brush')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Allée de gravier' })).toHaveAttribute('aria-pressed', 'true');
    await strokeTiles(page, [{ x: 4, y: 12 }]);
    await expect.poll(async () => (await terrainCells(id)).map((c) => `${c.kind}:${c.x},${c.y}`)).toEqual(
      ['gravel_path:0,12', 'gravel_path:2,12', 'gravel_path:4,12', 'gravel_path:0,13', 'gravel_path:1,13', 'gravel_path:2,13']);
  });

  test('un membre sans plan:edit ne peut pas poser un récupérateur d\'eau : vignette désactivée, aucun geste envoyé, requête forgée refusée (E2E-PNT-07b)', async ({ page }) => {
    const canal = gardenId('canal');
    // Case (22, 12) du Canal, échelle de 50 cm : pied de l'objet en (1125, 650).
    const tile = { x: 22, y: 12 };
    const foot = { x: 1125, y: 650 };
    await login(page, 'david');
    await page.goto(`/app/jardins/${canal}/plan`);
    await sceneReady(page, 'plan-editor');
    await page.getByTestId('tool-decor').click();
    const barrel = page.getByTestId('decor-item-rain_barrel');
    await expect(barrel).toHaveAttribute('aria-disabled', 'true');
    // `aria-disabled` n'empêche pas de toucher la vignette (Playwright, lui, attend qu'elle soit activée) : le message doit l'expliquer.
    await barrel.click({ force: true });
    await expect(page.getByTestId('decor-hint')).toHaveText('Réservé aux rôles qui peuvent modifier le plan.');
    const actions: string[] = [];
    page.on('request', (r) => { if (r.method() === 'POST' && r.headers()['next-action']) actions.push(r.postData() ?? ''); });
    await strokeTiles(page, [tile]);
    await page.waitForLoadState('networkidle');
    expect(actions).toEqual([]);
    // Requête forgée : le banc (permis) est remplacé par le récupérateur dans le corps de l'action.
    await page.route('**/*', async (route) => {
      const r = route.request();
      if (r.method() === 'POST' && r.headers()['next-action'] && (r.postData() ?? '').includes('"itemCode":"bench"')) {
        await route.continue({ postData: (r.postData() ?? '').replace('"itemCode":"bench"', '"itemCode":"rain_barrel"') });
      } else await route.continue();
    });
    await page.getByTestId('decor-item-bench').click();
    await strokeTiles(page, [tile]);
    await expect(page.getByTestId('plan-editor')).toHaveAttribute('data-status', 'error', { timeout: 15_000 });
    expect(await decorAtPosition(canal, 'rain_barrel', foot.x, foot.y)).toBeNull();
    expect(await decorAtPosition(canal, 'bench', foot.x, foot.y)).toBeNull();
  });
});

test.describe('vocabulaire de l\'éditeur', () => {
  test('[VOC-01] « Espaces cultivés », « Aménagements », « Objets » : une phrase d\'aide chacun, des vignettes au nom accessible', async ({ page }) => {
    const { gardenId: id } = await freshGarden('hugo');
    await login(page, 'hugo');
    await page.goto(`/app/jardins/${id}/plan`);
    await sceneReady(page, 'plan-editor');
    const tools = page.getByRole('toolbar', { name: 'Outils' });
    for (const [name, help, thumb] of [
      ['Espaces cultivés', 'Un espace cultivé a un historique : cultures, tâches, récoltes.', 'Planche'],
      ['Aménagements', 'Un aménagement dessine le jardin, sans historique.', 'Allée de gravier'],
      ['Objets', 'Un objet se pose sur une case', 'Récupérateur d’eau'],
    ] as const) {
      const button = tools.getByRole('button', { name, exact: true });
      await button.click();
      await expect(button).toHaveAttribute('aria-pressed', 'true');
      await expect(button).toHaveAccessibleDescription(new RegExp(help.slice(0, 30)));
      await expect(page.getByText(help, { exact: false })).toBeVisible();
      // Vignette : l'image réelle du type, et son nom lisible pour l'accessibilité.
      const tile = page.getByRole('button', { name: thumb, exact: true });
      await expect(tile).toBeVisible();
      await expect(tile.locator('img')).toHaveJSProperty('complete', true);
      expect(await tile.locator('img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    }
    // Plus de liste déroulante de type de zone ni d'élément de terrain.
    await expect(page.getByLabel('Type de zone')).toHaveCount(0);
    await expect(page.getByLabel('Élément de terrain')).toHaveCount(0);
  });
});

test.describe('saisons du terrain', () => {
  test('[TER-01] le 14 octobre dans l\'hémisphère nord : saison d\'automne, seul l\'atlas d\'automne est chargé', async ({ page }) => {
    const atlases: string[] = [];
    page.on('request', (r) => {
      const { pathname } = new URL(r.url());
      if (pathname.startsWith('/sprites/atlas/')) atlases.push(pathname.slice('/sprites/atlas/'.length));
    });
    await login(page, 'alice');
    await page.goto(`/app/jardins/${gardenId('tilleuls')}?vue=jardin`);
    await sceneReady(page);
    await expect(page.getByTestId('garden-view')).toHaveAttribute('data-season', 'autumn');
    expect(atlases).toContain('saison-automne.json');
    expect(atlases.filter((a) => a.startsWith('saison-') && !a.startsWith('saison-automne'))).toEqual([]);
  });
});

test.describe('avatars en action', () => {
  test('[LIV-01] [LIV-07] [LIV-06] seul dans mon jardin personnel, après un arrosage : mon avatar arrose au pied de la planche ; seul l\'atlas d\'arrosage est téléchargé en plus', async ({ page }) => {
    const { gardenId: id, zoneId } = await freshGarden('hugo', { watered: true });
    const actions: string[] = [];
    page.on('request', (r) => {
      const m = /\/sprites\/atlas\/avatar-action-([a-z]+)/.exec(new URL(r.url()).pathname);
      if (m?.[1]) actions.push(m[1]);
    });
    await login(page, 'hugo');
    await page.goto(`/app/jardins/${id}?vue=jardin`);
    await sceneReady(page);
    const avatar = page.getByTestId(`avatar-${userId('hugo')}`);
    await expect(avatar).toHaveAttribute('data-avatar-action', 'arroser');
    await expect(avatar).toHaveAttribute('data-zone-id', zoneId);
    await expect.poll(() => actions.length).toBeGreaterThan(0);
    await page.waitForLoadState('networkidle');
    expect([...new Set(actions)]).toEqual(['arroser']);
    // La liste textuelle dit l'action réelle et son ancienneté.
    await page.getByTestId('scene-list').locator('summary').click();
    await expect(page.getByTestId(`avatar-item-${userId('hugo')}`)).toHaveText('hugo a arrosé, près de Planche 2, il y a 40 min');
  });

  test('[LIV-04] animations réduites : l\'avatar montre la première image de son action, sans animation', async ({ page }) => {
    const { gardenId: id } = await freshGarden('hugo', { watered: true });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await login(page, 'hugo');
    await page.goto(`/app/jardins/${id}?vue=jardin`);
    await sceneReady(page);
    const view = page.getByTestId('garden-view');
    await expect(view).toHaveAttribute('data-reduced-motion', 'true');
    await expect(view).toHaveAttribute('data-ticker', 'stopped');
    const avatar = page.getByTestId(`avatar-${userId('hugo')}`);
    await expect(avatar).toHaveAttribute('data-avatar-action', 'arroser');
    await expect(avatar).toHaveAttribute('data-avatar-animated', 'false');
  });
});

test.describe('avatars entre les zones', () => {
  test('[LIV-05] 20 s sans interaction : la boucle s\'arrête et l\'avatar reste à sa place', async ({ page }) => {
    const { gardenId: id } = await freshGarden('hugo', { watered: true });
    // Horloge de la page en marche (pour le chargement), puis avancée d'un coup : `performance.now` et les images d'animation suivent.
    await page.clock.install();
    await login(page, 'hugo');
    await page.goto(`/app/jardins/${id}?vue=jardin`);
    await sceneReady(page);
    const view = page.getByTestId('garden-view');
    await expect(view).toHaveAttribute('data-ticker', 'running');
    const avatar = page.getByTestId(`avatar-${userId('hugo')}`);
    const before = await avatar.boundingBox();
    await page.clock.runFor(21_000);
    await expect(view).toHaveAttribute('data-ticker', 'stopped');
    expect(await avatar.boundingBox()).toEqual(before);
  });
});
