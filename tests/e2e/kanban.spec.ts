import { expect, test } from '@playwright/test';
import { gardenId } from './ids';
import { login } from './helpers';

const CANAL = gardenId('canal');

/** Glisser-déposer HTML5 : exécuté sur le projet desktop (le tactile utilise le menu « Déplacer vers »). */
test.describe('kanban', () => {
  test('[TCK-10] glisser une carte vers « Terminé » ; une transition refusée la laisse en place', async ({ page }) => {
    await login(page, 'chloe');
    await page.goto(`/app/jardins/${CANAL}/tickets?vue=kanban`);
    const card = page.getByTestId('column-todo').locator('[data-testid^="card-"]', { hasText: 'Semer les engrais verts' });
    // La transition est une Server Action (POST) : on attend sa réponse avant de recharger.
    await Promise.all([page.waitForResponse((r) => r.request().method() === 'POST' && r.ok()), card.dragTo(page.getByTestId('column-done'))]);
    await expect(page.getByTestId('column-done')).toContainText('Semer les engrais verts');
    await page.reload();
    const done = page.getByTestId('column-done').locator('[data-testid^="card-"]', { hasText: 'Semer les engrais verts' });
    await expect(done).toBeVisible();
    await done.getByRole('combobox').selectOption({ label: '→ En cours' });
    await expect(page.getByTestId('kanban-error')).toBeVisible();
    await expect(page.getByTestId('column-done')).toContainText('Semer les engrais verts');
  });

});
