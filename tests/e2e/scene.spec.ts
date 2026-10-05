import { devices, expect, test, type Page } from '@playwright/test';
import { cultureOfTicket, decorAtPosition, placedEntities, practiceDeclarations, zoneAt } from './db';
import { gardenId, userId, zoneId } from './ids';
import { dragTiles, login, sceneReady } from './helpers';

const TILLEULS = gardenId('tilleuls');
const CANAL = gardenId('canal');
const PIXI_SIGNATURE = '__PIXI_APP_INIT__';

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

  test('la vue jardin ne télécharge que l\'atlas de la scène, celui de la saison et celui de l\'avatar, sous 3 Mo, plus les actions jouées (audit 2026-10-03, M1)', async ({ page }) => {
    const atlas: { name: string; bytes: number }[] = [];
    page.on('response', (r) => {
      const { pathname } = new URL(r.url());
      if (pathname.startsWith('/sprites/atlas/')) void r.body().then((b) => atlas.push({ name: pathname.slice('/sprites/atlas/'.length), bytes: b.length }), () => undefined);
    });
    await login(page, 'alice');
    await page.goto(`/app/jardins/${TILLEULS}?vue=jardin`);
    await sceneReady(page);
    await page.waitForLoadState('networkidle');
    expect(atlas.length).toBeGreaterThan(0);
    // Scène, saison courante (automne à la date des e2e) et avatar : sous 3 Mo.
    const base = atlas.filter((a) => !a.name.startsWith('avatar-action-'));
    for (const a of base) expect(a.name).toMatch(/^((avatar-)?atlas|saison-automne)(-\d+)?\.(json|png)$/);
    expect(base.reduce((t, a) => t + a.bytes, 0)).toBeLessThan(3 * 1024 * 1024);
    // Atlas d'action (§9.2) : seulement ceux des actions jouées par les avatars affichés, chacun sous 1 Mo.
    const played = new Set(await page.locator('[data-avatar-action]').evaluateAll((els) => els.map((e) => e.getAttribute('data-avatar-action')).filter(Boolean)));
    const actions = atlas.filter((a) => a.name.startsWith('avatar-action-'));
    for (const a of actions) expect(played.has(/^avatar-action-([a-z]+)/.exec(a.name)?.[1] ?? '')).toBe(true);
    for (const action of played) expect(actions.filter((a) => a.name.startsWith(`avatar-action-${action}`)).reduce((t, a) => t + a.bytes, 0)).toBeLessThan(1024 * 1024);
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

  test('[POL-03] deux touchers rapides sur une zone zooment la caméra sur elle (§9.5)', async ({ page }) => {
    await login(page, 'alice');
    await page.goto(`/app/jardins/${TILLEULS}?vue=jardin`);
    await sceneReady(page);
    // Bac 1 : une zone sans sous-zone, qu'aucun autre bouton ne recouvre.
    const zone = page.getByTestId(`zone-${zoneId('tilleuls', 'bac1')}`);
    const before = await zone.boundingBox();
    // Deux touchers rapides (les écrans tactiles n'émettent pas toujours `dblclick`).
    await zone.click();
    await zone.click();
    await expect.poll(async () => (await zone.boundingBox())?.width ?? 0).toBeGreaterThan((before?.width ?? 0) * 1.5);
    // La zone est au centre du cadre.
    const after = await zone.boundingBox();
    const view = await page.getByTestId('scene-viewport').boundingBox();
    if (!after || !view) throw new Error('boîtes absentes');
    expect(Math.abs(after.x + after.width / 2 - (view.x + view.width / 2))).toBeLessThan(view.width * 0.1);
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
    // La feuille de la serre s'ouvre depuis la liste des éléments ; toucher la serre elle-même y entre (MAP-14).
    await page.getByTestId('scene-list').locator('summary').click();
    await page.getByTestId('scene-list').getByRole('button', { name: 'Serre', exact: true }).click();
    await page.getByTestId('zone-enter').click();
    await expect(page.getByTestId('scene-breadcrumb')).toContainText('Serre');
    await expect(page.getByTestId(`zone-${zoneId('canal', 't1')}`)).toBeVisible();
    await expect(page.getByTestId(`zone-${zoneId('canal', 't1-b1')}`)).toHaveCount(1);
    await expect(page.getByTestId(`zone-${zoneId('canal', 'a')}`)).toHaveCount(0);
    await page.getByTestId('breadcrumb-root').click();
    await expect(page.getByTestId(`zone-${zoneId('canal', 'a')}`)).toHaveCount(1);
  });

  test('[MAP-14] toucher la serre l\'efface et ouvre sa scène intérieure', async ({ page }) => {
    await login(page, 'bruno');
    await page.goto(`/app/jardins/${CANAL}?vue=jardin`);
    await sceneReady(page);
    await page.getByTestId(`zone-${zoneId('canal', 'serre')}`).click();
    await expect(page).toHaveURL(new RegExp(`scene=${zoneId('canal', 'serre')}`));
    await expect(page.getByTestId('scene-breadcrumb')).toContainText('Serre');
    await expect(page.getByTestId(`zone-${zoneId('canal', 't1')}`)).toBeVisible();
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
  test('[PLN-01] [PLN-02] dessiner une planche de (2, 2) à (5, 4) dans le Potager crée une zone de 200 × 150 cm ; le formulaire par dimensions donne le même résultat', async ({ page }) => {
    const geometry = { x: 100, y: 100, w: 200, h: 150 };
    await login(page, 'alice');
    await page.goto(`/app/jardins/${TILLEULS}/plan`);
    await sceneReady(page, 'plan-editor');
    const editor = page.getByTestId('plan-editor');
    const version = Number(await editor.getAttribute('data-plan-version'));
    await page.getByTestId('tool-zone').click();
    await page.getByTestId('zone-type-bed').click();
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
    // La grille doit être à l'écran : sinon le clic tombe sur la navigation fixe du bas (mobile).
    await grid.scrollIntoViewIfNeeded();
    const box = await grid.boundingBox();
    const tile = Number(await grid.getAttribute('data-tile-px'));
    await page.mouse.click((box?.x ?? 0) + Number(await grid.getAttribute('data-origin-x')) + 3 * tile, (box?.y ?? 0) + Number(await grid.getAttribute('data-origin-y')) + 3 * tile);
    // Zone sans culture : la gomme l'archive sans confirmation (PLN-09).
    await expect(page.getByTestId('erase-confirm')).toHaveCount(0);
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

  /** Position écran du centre d'une tuile de la grille de l'éditeur. */
  async function tileCenter(page: Page, t: { x: number; y: number }) {
    const grid = page.getByTestId('plan-grid');
    await grid.scrollIntoViewIfNeeded();
    const box = await grid.boundingBox();
    if (!box) throw new Error('grille absente');
    const tile = Number(await grid.getAttribute('data-tile-px'));
    return { x: box.x + Number(await grid.getAttribute('data-origin-x')) + (t.x + 0.5) * tile, y: box.y + Number(await grid.getAttribute('data-origin-y')) + (t.y + 0.5) * tile };
  }

  test('[PLN-09] la gomme demande confirmation pour une planche qui porte des cultures en cours', async ({ page }) => {
    await login(page, 'bruno');
    await page.goto(`/app/jardins/${CANAL}/plan`);
    await sceneReady(page, 'plan-editor');
    const version = await page.getByTestId('plan-editor').getAttribute('data-plan-version');
    await page.getByTestId('tool-eraser').click();
    // Planche A1 : de (1, 1) à (4, 6), avec des cultures en cours dans le seed.
    const at = await tileCenter(page, { x: 2, y: 3 });
    await page.mouse.click(at.x, at.y);
    await expect(page.getByTestId('erase-confirm')).toBeVisible();
    await page.getByRole('button', { name: 'Annuler' }).click();
    await expect(page.getByTestId('plan-status')).toHaveText(/enregistr/i);
    await expect(page.getByTestId('plan-editor')).toHaveAttribute('data-plan-version', version ?? '');
  });

  test('[PLN-10] un double-clic sur la serre ouvre l\'éditeur de son intérieur, et le fil d\'Ariane ramène dehors', async ({ page }) => {
    await login(page, 'bruno');
    await page.goto(`/app/jardins/${CANAL}/plan`);
    await sceneReady(page, 'plan-editor');
    // Serre : de (14, 10) à (21, 15).
    const at = await tileCenter(page, { x: 17, y: 12 });
    await page.mouse.dblclick(at.x, at.y);
    await expect(page).toHaveURL(new RegExp(`/plan\\?scene=${zoneId('canal', 'serre')}`));
    await expect(page.getByTestId('plan-breadcrumb')).toContainText('Serre');
    // L'éditeur repart sur la scène intérieure : ses zones sont celles de la serre.
    await expect(page.getByTestId('dims-parent').locator('option', { hasText: /^Table 1(,|$)/ })).toHaveCount(1);
    await expect(page.getByTestId('dims-parent').locator('option', { hasText: /^Parcelle A(,|$)/ })).toHaveCount(0);
    await page.getByTestId('plan-breadcrumb-root').click();
    await expect(page).toHaveURL(new RegExp(`/jardins/${CANAL}/plan$`));
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
    await page.getByTestId('zone-type-bed').click();
    // Bande libre sous le tunnel (y = 600 à 650 cm) : deux planches qui ne se touchent pas.
    await dragTiles(page, { x: 0, y: 12 }, { x: 1, y: 12 });
    await expect(editor).toHaveAttribute('data-status', 'saving');
    await dragTiles(page, { x: 4, y: 12 }, { x: 5, y: 12 });
    await expect(editor).toHaveAttribute('data-plan-version', String(version + 2), { timeout: 20_000 });
    await expect(page.getByTestId('plan-conflicts')).toHaveCount(0);
    expect(await zoneAt(COMBES, { x: 0, y: 600, w: 100, h: 50 })).not.toBeNull();
    expect(await zoneAt(COMBES, { x: 200, y: 600, w: 100, h: 50 })).not.toBeNull();
  });

  test('[PLN-03] deux sessions éditent le même plan : la seconde reçoit CONFLICT, recharge, rejoue et enregistre sa zone (E2E-PLN-03b)', async ({ page, browser }) => {
    const COMBES = gardenId('combes');
    await login(page, 'gaelle');
    const other = await (await browser.newContext()).newPage();
    await login(other, 'gaelle');
    for (const p of [page, other]) {
      await p.goto(`/app/jardins/${COMBES}/plan`);
      await sceneReady(p, 'plan-editor');
    }
    const version = Number(await page.getByTestId('plan-editor').getAttribute('data-plan-version'));
    expect(Number(await other.getByTestId('plan-editor').getAttribute('data-plan-version'))).toBe(version);
    // A enregistre d'abord (bande libre x = 600 à 700 cm, entre la serre et la pépinière).
    await page.getByTestId('tool-zone').click();
    await dragTiles(page, { x: 12, y: 0 }, { x: 13, y: 1 });
    await expect(page.getByTestId('plan-editor')).toHaveAttribute('data-plan-version', String(version + 1));
    // B, resté sur l'ancienne version, dessine ailleurs : CONFLICT, rechargement, rejeu, nouvel enregistrement.
    await other.getByTestId('tool-zone').click();
    await dragTiles(other, { x: 12, y: 4 }, { x: 13, y: 5 });
    await expect(other.getByTestId('plan-editor')).toHaveAttribute('data-plan-version', String(version + 2), { timeout: 20_000 });
    await expect(other.getByTestId('plan-conflicts')).toHaveCount(0);
    expect(await zoneAt(COMBES, { x: 600, y: 0, w: 100, h: 100 })).not.toBeNull();
    expect(await zoneAt(COMBES, { x: 600, y: 200, w: 100, h: 100 })).not.toBeNull();
  });

  test('[PLN-06] un membre d\'un jardin collectif (édition réservée aux admins) voit les outils de zone et de terrain désactivés, avec une explication', async ({ page }) => {
    await login(page, 'david');
    await page.goto(`/app/jardins/${CANAL}/plan`);
    await sceneReady(page, 'plan-editor');
    await expect(page.getByTestId('plan-readonly')).toBeVisible();
    for (const tool of ['tool-zone', 'tool-terrain', 'plan-scale']) await expect(page.getByTestId(tool), tool).toBeDisabled();
    // La déco a sa propre permission (`decor:place`, membres compris) : l'outil Déco et la gomme (sur la déco) restent actifs.
    await expect(page.getByTestId('tool-decor')).toBeEnabled();
    await expect(page.getByTestId('tool-eraser')).toBeEnabled();
    await expect(page.getByTestId('zone-form-dims')).toHaveCount(0);
  });

  test('un membre sans plan:edit pose un banc avec l\'outil Déco ; la gomme sur un objet déclaré propose de garder la pratique (E2E-DEC-01b)', async ({ page, browser }) => {
    // Canal : decor_min_role = member, plan_edit_min_role = admin. La tuile (12, 2) est libre, entre les parcelles A et B.
    await login(page, 'david');
    await page.goto(`/app/jardins/${CANAL}/plan`);
    await sceneReady(page, 'plan-editor');
    const editor = page.getByTestId('plan-editor');
    const version = Number(await editor.getAttribute('data-plan-version'));
    await page.getByTestId('tool-decor').click();
    await page.getByTestId('decor-item-bench').click();
    await dragTiles(page, { x: 12, y: 2 }, { x: 12, y: 2 });
    await expect(editor).toHaveAttribute('data-plan-version', String(version + 1));
    // Pied du banc : bas de la tuile, centré sur son emprise d'une tuile de 50 cm.
    expect(await decorAtPosition(CANAL, 'bench', 625, 150)).toMatchObject({ placedBy: userId('david') });

    // Tilleuls : l'hôtel à insectes du seed est déclaré comme pratique ; la gomme propose de la garder.
    const alice = await (await browser.newContext({ ...devices['Pixel 7'] })).newPage();
    await login(alice, 'alice');
    await alice.goto(`/app/jardins/${TILLEULS}/plan`);
    await sceneReady(alice, 'plan-editor');
    const aliceEditor = alice.getByTestId('plan-editor');
    const v2 = Number(await aliceEditor.getAttribute('data-plan-version'));
    await alice.getByTestId('tool-eraser').click();
    await dragTiles(alice, { x: 24, y: 8 }, { x: 24, y: 8 });
    await expect(alice.getByRole('dialog')).toContainText('Hôtel à insectes');
    await alice.getByTestId('decor-remove-keep').click();
    await expect(aliceEditor).toHaveAttribute('data-plan-version', String(v2 + 1));
    expect(await decorAtPosition(TILLEULS, 'insect_hotel', 1225, 450)).toBeNull();
    expect(await practiceDeclarations(TILLEULS, 'biodiversity_insect_hotel')).toEqual([{ decorPlacementId: null }]);
  });
});
