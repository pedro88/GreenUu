import { expect, test, type Page } from '@playwright/test';
import { cultureOfTicket, placedEntities, zoneAt } from './db';
import { gardenId, zoneId } from './ids';
import { login } from './helpers';

const TILLEULS = gardenId('tilleuls');
const CANAL = gardenId('canal');
const PIXI_SIGNATURE = '__PIXI_APP_INIT__';

/**
 * Le canvas WebGL est prêt. Chromium fournit WebGL : le rendu de repli (`unavailable`) n'est pas un succès ici. C'est
 * lui qui masquait le blocage de PixiJS par la CSP de production (E2E-MAP-01b, audit lot 7 M1).
 */
async function sceneReady(page: Page, testId = 'garden-view') {
  await expect(page.getByTestId(testId)).toHaveAttribute('data-canvas', 'ready');
  await expect(page.getByTestId(testId).locator('canvas')).toHaveCount(1);
}

test.describe('vue jardin', () => {
  test('[MAP-01] la vue classique d\'un jardin ne télécharge aucun bundle PixiJS ; la vue jardin, si', async ({ page }) => {
    const scripts: string[] = [];
    page.on('response', (r) => {
      if (r.request().resourceType() === 'script') void r.text().then((b) => scripts.push(b), () => undefined);
    });
    await login(page, 'alice');
    await page.goto(`/app/jardins/${TILLEULS}?vue=classique`);
    await expect(page.getByTestId('garden-overview')).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(scripts.length).toBeGreaterThan(0);
    // Signature propre à la bibliothèque (hook global de l'Application PixiJS), absente de notre code.
    expect(scripts.some((b) => b.includes(PIXI_SIGNATURE))).toBe(false);
    expect(await page.evaluate(() => 'greenuPixiLoaded' in window || '__greenuPixiLoaded' in window)).toBe(false);
    // Contrôle positif : la vue jardin charge bien le moteur.
    await page.goto(`/app/jardins/${TILLEULS}?vue=jardin`);
    await sceneReady(page);
    expect(await page.evaluate(() => '__greenuPixiLoaded' in window)).toBe(true);
    await expect.poll(() => scripts.some((b) => b.includes(PIXI_SIGNATURE))).toBe(true);
  });

  test('[MAP-02] [A11Y-03] chaque zone placée et chaque culture active a un bouton ; tout est atteignable au clavier, avec un focus visible, et Entrée ouvre la feuille', async ({ page }) => {
    const expected = await placedEntities(TILLEULS);
    expect(expected.zones.length).toBeGreaterThan(5);
    expect(expected.cultures.length).toBeGreaterThan(0);
    await login(page, 'alice');
    await page.goto(`/app/jardins/${TILLEULS}?vue=jardin`);
    await sceneReady(page);
    for (const id of expected.zones) await expect(page.getByTestId(`zone-${id}`), id).toHaveCount(1);
    for (const id of expected.cultures) await expect(page.getByTestId(`culture-${id}`), id).toHaveCount(1);
    await expect(page.getByTestId(`culture-${expected.cultures[0]}`)).toHaveAttribute('aria-label', /, /);

    // Navigation au clavier : chaque entité est atteinte par Tab, avec un contour de focus visible.
    const wanted = new Set([...expected.zones.map((z) => `zone-${z}`), ...expected.cultures.map((c) => `culture-${c}`)]);
    const reached = new Set<string>();
    await page.getByTestId('open-plan').focus();
    for (let i = 0; i < wanted.size + 10 && reached.size < wanted.size; i += 1) {
      await page.keyboard.press('Tab');
      const focused = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null; // as: élément actif du document
        return el ? { id: el.dataset.testid ?? '', outline: getComputedStyle(el).outlineStyle } : null;
      });
      if (focused && wanted.has(focused.id)) {
        reached.add(focused.id);
        expect(focused.outline, focused.id).not.toBe('none');
      }
    }
    expect([...wanted].filter((id) => !reached.has(id))).toEqual([]);
    await page.getByTestId(`culture-${expected.cultures[0]}`).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('scene-sheet')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('scene-sheet')).toHaveCount(0);
    await expect(page.getByTestId(`culture-${expected.cultures[0]}`)).toBeFocused();
  });

  test('[MAP-03] toucher une culture ouvre sa feuille : étape, états expliqués et actions rapides', async ({ page }) => {
    const { cultures } = await placedEntities(TILLEULS);
    await login(page, 'alice');
    await page.goto(`/app/jardins/${TILLEULS}?vue=jardin`);
    await sceneReady(page);
    const button = page.getByTestId(`culture-${cultures[0]}`);
    await button.scrollIntoViewIfNeeded();
    // Cible tactile d'au moins 44 px à l'écran, même dézoomée pour faire tenir le jardin (audit lot 7, M4).
    const box = await button.boundingBox();
    expect(Math.min(box?.width ?? 0, box?.height ?? 0)).toBeGreaterThanOrEqual(44);
    const label = (await button.getAttribute('aria-label')) ?? '';
    await button.click();
    const sheet = page.getByTestId('scene-sheet');
    await expect(sheet.getByRole('heading', { level: 2 })).toHaveText(label.split(',')[0] ?? '');
    await expect(sheet.getByTestId('sheet-stage')).toContainText('Étape :');
    for (const action of ['observation', 'photo', 'watering', 'harvest']) await expect(sheet.getByTestId(`sheet-${action}`)).toBeVisible();
    await expect(sheet.getByTestId('sheet-open')).toHaveAttribute('href', `/app/jardins/${TILLEULS}/cultures/${cultures[0]}`);
    // Une action rapide ouvre la saisie rapide dans son mode.
    await sheet.getByTestId('sheet-harvest').click();
    await expect(page.getByRole('dialog').getByTestId('quick-qty-input')).toBeVisible();
  });

  test('[MAP-02] une culture qui a un ticket en retard porte l\'état dans sa couche accessible, et sa feuille l\'explique', async ({ page }) => {
    // Seed : ticket échu le 30 août 2026, toujours ouvert au 14 octobre (E2E_NOW) ; aucune autre spec ne le termine.
    const id = await cultureOfTicket(TILLEULS, 'Terminer : Tomate Noire de Crimée (Planche 1)');
    await login(page, 'alice');
    await page.goto(`/app/jardins/${TILLEULS}?vue=jardin`);
    await sceneReady(page);
    const button = page.getByTestId(`culture-${id}`);
    await expect(button).toHaveAttribute('data-state', /(^| )overdue_ticket( |$)/);
    await expect(button).toHaveAttribute('aria-label', /ticket en retard/);
    await button.scrollIntoViewIfNeeded();
    await button.click();
    await expect(page.getByTestId('sheet-states')).toContainText('ticket en retard — un ticket ouvert sur cette culture a dépassé son échéance.');
  });

  test('[MAP-10] entrer dans la serre affiche la scène intérieure, et le fil d\'Ariane ramène dehors', async ({ page }) => {
    await login(page, 'bruno');
    await page.goto(`/app/jardins/${CANAL}?vue=jardin`);
    await sceneReady(page);
    await page.getByTestId(`zone-${zoneId('canal', 'serre')}`).click();
    await page.getByTestId('zone-enter').click();
    await expect(page.getByTestId('scene-breadcrumb')).toContainText('Serre');
    await expect(page.getByTestId(`zone-${zoneId('canal', 't1')}`)).toBeVisible();
    await expect(page.getByTestId(`zone-${zoneId('canal', 't1-b1')}`)).toHaveCount(1);
    await expect(page.getByTestId(`zone-${zoneId('canal', 'a')}`)).toHaveCount(0);
    await page.getByTestId('breadcrumb-root').click();
    await expect(page.getByTestId(`zone-${zoneId('canal', 'a')}`)).toHaveCount(1);
  });

  test('[MAP-12] après une bascule en vue classique, la vue classique s\'ouvre par défaut à la reconnexion', async ({ page, browser }) => {
    // emma : aucun autre test n'ouvre la racine d'un jardin sans `?vue=` en attendant une vue précise ; la préférence est
    // remise à l'état initial en fin de test. (farid est réservé à AUTH-07, qui change son mot de passe.)
    await login(page, 'emma');
    await page.goto(`/app/jardins/${CANAL}`);
    await expect(page.getByTestId('garden-view')).toBeVisible();
    await page.getByTestId('view-classic').click();
    await expect(page.getByTestId('garden-overview')).toBeVisible();
    const again = await (await browser.newContext()).newPage();
    await login(again, 'emma');
    await again.goto(`/app/jardins/${CANAL}`);
    await expect(again.getByTestId('garden-overview')).toBeVisible();
    await expect(again.getByTestId('garden-view')).toHaveCount(0);
    // Remise à l'état initial.
    await again.getByTestId('view-garden').click();
    await expect(again.getByTestId('garden-view')).toBeVisible();
  });
});

test.describe('vue jardin, animations réduites', () => {
  test.use({ reducedMotion: 'reduce' });

  test('[MAP-09] avec prefers-reduced-motion, la boucle reste arrêtée et les transitions sont instantanées', async ({ page }) => {
    await login(page, 'bruno');
    await page.goto(`/app/jardins/${CANAL}?vue=jardin`);
    await sceneReady(page);
    const view = page.getByTestId('garden-view');
    await expect(view).toHaveAttribute('data-reduced-motion', 'true');
    await expect(view).toHaveAttribute('data-transition', 'instant');
    await expect(view).toHaveAttribute('data-ticker', 'stopped');
    await page.getByTestId('zoom-in').click();
    await page.waitForTimeout(1500); // fenêtre d'observation : la boucle ne doit pas redémarrer après une interaction
    await expect(view).toHaveAttribute('data-ticker', 'stopped');
  });
});

test.describe('éditeur de plan', () => {
  /** Glisser sur la grille, d'une tuile à une autre, à partir des attributs exposés par la couche (§9.6). */
  async function dragTiles(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
    const grid = page.getByTestId('plan-grid');
    await grid.scrollIntoViewIfNeeded();
    const box = await grid.boundingBox();
    if (!box) throw new Error('grille absente');
    const tile = Number(await grid.getAttribute('data-tile-px'));
    const ox = Number(await grid.getAttribute('data-origin-x'));
    const oy = Number(await grid.getAttribute('data-origin-y'));
    const at = (t: { x: number; y: number }) => ({ x: box.x + ox + (t.x + 0.5) * tile, y: box.y + oy + (t.y + 0.5) * tile });
    await page.mouse.move(at(from).x, at(from).y);
    await page.mouse.down();
    await page.mouse.move(at(to).x, at(to).y, { steps: 6 });
    await page.mouse.up();
  }

  test('[PLN-01] [PLN-02] dessiner une planche de (2, 2) à (5, 4) dans le Potager crée une zone de 200 × 150 cm ; le formulaire par dimensions donne le même résultat', async ({ page }) => {
    const geometry = { x: 100, y: 100, w: 200, h: 150 };
    await login(page, 'alice');
    await page.goto(`/app/jardins/${TILLEULS}/plan`);
    await sceneReady(page, 'plan-editor');
    const editor = page.getByTestId('plan-editor');
    const version = Number(await editor.getAttribute('data-plan-version'));
    await page.getByTestId('tool-zone').click();
    await page.getByTestId('zone-type').selectOption({ label: 'Planche' });
    await dragTiles(page, { x: 2, y: 2 }, { x: 5, y: 4 });
    // Enregistrement automatique 1,5 s après le geste.
    await expect(editor).toHaveAttribute('data-plan-version', String(version + 1));
    const drawn = await zoneAt(TILLEULS, geometry);
    expect(drawn).toMatchObject({ type: 'bed', parent: 'Potager', geometry: { v: 1, kind: 'rect', ...geometry } });
    await page.goto(`/app/jardins/${TILLEULS}/zones`);
    await expect(page.getByTestId(`zone-node-${drawn?.id}`)).toContainText('3 m²');

    // La gomme archive la zone, puis le formulaire alternatif la recrée à l'identique.
    await page.goto(`/app/jardins/${TILLEULS}/plan`);
    await sceneReady(page, 'plan-editor');
    await page.getByTestId('tool-eraser').click();
    const grid = page.getByTestId('plan-grid');
    const box = await grid.boundingBox();
    const tile = Number(await grid.getAttribute('data-tile-px'));
    await page.mouse.click((box?.x ?? 0) + Number(await grid.getAttribute('data-origin-x')) + 3 * tile, (box?.y ?? 0) + Number(await grid.getAttribute('data-origin-y')) + 3 * tile);
    await page.getByTestId('erase-confirm').click();
    await expect(editor).toHaveAttribute('data-plan-version', String(version + 2));
    expect(await zoneAt(TILLEULS, geometry)).toBeNull();

    await page.getByTestId('dims-name').fill(drawn?.name ?? 'Planche');
    await page.getByTestId('dims-type').selectOption({ label: 'Planche' });
    await page.getByTestId('dims-parent').selectOption({ label: 'Potager' });
    for (const [k, v] of Object.entries(geometry)) await page.getByTestId(`dims-${k}`).fill(String(v));
    await page.getByTestId('dims-submit').click();
    await expect(editor).toHaveAttribute('data-plan-version', String(version + 3));
    const typed = await zoneAt(TILLEULS, geometry);
    expect(typed).toMatchObject({ name: drawn?.name, type: drawn?.type, parent: drawn?.parent, geometry: drawn?.geometry });
  });

  test('un geste fait pendant un enregistrement lent est enregistré ensuite, sans faux conflit (audit lot 7, M3)', async ({ page }) => {
    const COMBES = gardenId('combes');
    await login(page, 'gaelle');
    await page.goto(`/app/jardins/${COMBES}/plan`);
    await sceneReady(page, 'plan-editor');
    const editor = page.getByTestId('plan-editor');
    const version = Number(await editor.getAttribute('data-plan-version'));
    // Chaque appel d'action met 2,5 s à partir : le second geste tombe pendant le premier enregistrement.
    await page.route('**/*', async (route) => {
      if (route.request().method() === 'POST' && route.request().headers()['next-action']) await new Promise((r) => setTimeout(r, 2500));
      await route.continue();
    });
    await page.getByTestId('tool-zone').click();
    await page.getByTestId('zone-type').selectOption({ label: 'Planche' });
    // Bande libre sous le tunnel (y = 600 à 650 cm) : deux planches qui ne se touchent pas.
    await dragTiles(page, { x: 0, y: 12 }, { x: 1, y: 12 });
    await expect(editor).toHaveAttribute('data-status', 'saving');
    await dragTiles(page, { x: 4, y: 12 }, { x: 5, y: 12 });
    await expect(editor).toHaveAttribute('data-plan-version', String(version + 2), { timeout: 20_000 });
    await expect(page.getByTestId('plan-conflicts')).toHaveCount(0);
    expect(await zoneAt(COMBES, { x: 0, y: 600, w: 100, h: 50 })).not.toBeNull();
    expect(await zoneAt(COMBES, { x: 200, y: 600, w: 100, h: 50 })).not.toBeNull();
  });

  test('[PLN-06] un membre d\'un jardin collectif (édition réservée aux admins) voit les outils désactivés, avec une explication', async ({ page }) => {
    await login(page, 'david');
    await page.goto(`/app/jardins/${CANAL}/plan`);
    await sceneReady(page, 'plan-editor');
    await expect(page.getByTestId('plan-readonly')).toBeVisible();
    for (const tool of ['tool-zone', 'tool-terrain', 'tool-eraser', 'plan-scale', 'zone-type']) await expect(page.getByTestId(tool), tool).toBeDisabled();
    await expect(page.getByTestId('zone-form-dims')).toHaveCount(0);
  });
});
