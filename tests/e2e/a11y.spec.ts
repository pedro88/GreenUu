import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { seedId } from '../../src/lib/uuid5';
import { gardenId, zoneId } from './ids';
import { login } from './helpers';

const PUBLIC = ['/', '/connexion', '/inscription', '/mot-de-passe-oublie', '/guides-publics'];
const APP = [
  '/app', '/app/jardins', '/app/jardins/nouveau', '/app/parametres/compte',
  `/app/jardins/${gardenId('canal')}`, `/app/jardins/${gardenId('canal')}/zones`,
  `/app/jardins/${gardenId('canal')}/zones/${zoneId('canal', 'serre')}`,
  `/app/jardins/${gardenId('canal')}/membres`, `/app/jardins/${gardenId('canal')}/parametres`,
  `/app/jardins/${gardenId('canal')}/cultures`, `/app/jardins/${gardenId('canal')}/cultures/nouvelle`, `/app/jardins/${gardenId('canal')}/saisons`,
  '/app/plantes', '/app/plantes/proposer', `/app/plantes/${seedId('species:tomate')}`,
  `/app/jardins/${gardenId('canal')}/tickets`, `/app/jardins/${gardenId('canal')}/tickets?vue=kanban`, `/app/jardins/${gardenId('canal')}/tickets?vue=calendrier`,
  `/app/jardins/${gardenId('canal')}/tickets/nouveau`, '/app/taches', '/app/notifications', '/app/parametres/notifications',
  '/app/guides', '/app/guides/nouveau', '/app/tips', '/app/jardiniers/alice',
  `/app/jardins/${gardenId('canal')}/recommandations`, '/app/parametres/confidentialite',
  '/app/profil', '/app/profil/xp', '/app/profil/succes', '/app/profil/quetes', `/app/jardins/${gardenId('canal')}/membres?onglet=contributions`,
];

async function audit(page: Page, path: string) {
  await page.goto(path);
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious.map((v) => `${path} : ${v.id} (${v.nodes.length})`)).toEqual([]);
}

test.describe('accessibilité', () => {
  test('[A11Y-01] pages publiques sans violation sérieuse (axe)', async ({ page }) => {
    for (const p of PUBLIC) await audit(page, p);
  });

  test('[A11Y-01] pages applicatives sans violation sérieuse (axe)', async ({ page }) => {
    await login(page, 'bruno');
    for (const p of APP) await audit(page, p);
  });

  test('[A11Y-02] à 360 px : pas de défilement horizontal', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await login(page, 'bruno');
    for (const p of [...PUBLIC, ...APP]) {
      await page.goto(p);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, p).toBeLessThanOrEqual(0);
    }
  });
});
