import { expect, test, type Page } from '@playwright/test';
import { gardenId } from './ids';
import { linkFrom, login, waitForMail } from './helpers';

const CANAL = gardenId('canal');
const unique = `Ouvrir les aérations ${Date.now().toString(36)}`;

async function myTasks(page: Page) {
  await page.goto('/app/taches');
  return page.getByTestId('my-tasks');
}

test.describe.serial('ticketing', () => {
  test('[TCK-01] ticket assigné à un groupe : tâches des membres, e-mails Mailpit, niveau zone', async ({ page, browser }) => {
    await login(page, 'chloe');
    await page.goto(`/app/jardins/${CANAL}/tickets/nouveau`);
    await page.getByLabel('Titre').fill(unique);
    await page.getByLabel('Rattachée à').selectOption({ label: 'Serre' });
    await page.getByTestId('ticket-form').getByText('Équipe serre', { exact: true }).click();
    await page.getByTestId('ticket-submit').click();
    await expect(page.getByTestId('ticket-title')).toHaveText(unique);
    await expect(page.getByText('Rattachée à :')).toContainText('Serre');
    for (const who of ['david', 'emma']) {
      const mail = await waitForMail(`${who}@greenu.test`, unique);
      expect(mail.subject).toContain('Nouvelle tâche pour toi');
      const p = await (await browser.newContext()).newPage();
      await login(p, who);
      await expect(await myTasks(p)).toContainText(unique);
    }
  });

  test('[TCK-08] mes tâches du jour : retards d\'abord, rien de futur ni d\'étranger', async ({ page }) => {
    await login(page, 'david');
    const list = await myTasks(page);
    const items = list.locator('li');
    await expect(items.first()).toHaveAttribute('data-late', 'true');
    await expect(list).toContainText('Tailler les framboisiers');
    await expect(list).not.toContainText('Commander du terreau');
    await expect(list).not.toContainText('Retourner le compost');
  });

  test('[TCK-09] vue kanban et filtre par groupe conservés au rechargement', async ({ page }) => {
    await login(page, 'chloe');
    await page.goto(`/app/jardins/${CANAL}/tickets`);
    await page.getByTestId('view-kanban').click();
    await expect(page.getByTestId('kanban')).toBeVisible();
    await page.getByTestId('f-groupe').selectOption({ label: 'Équipe serre' });
    await expect(page).toHaveURL(/groupe=/);
    await page.reload();
    await expect(page.getByTestId('kanban')).toBeVisible();
    await expect(page.getByTestId('f-groupe').locator('option:checked')).toHaveText('Équipe serre');
    await expect(page.getByTestId('kanban')).not.toContainText('Commander du terreau');
  });

  test('[TCK-16] terminer un ticket d\'étape propose de renseigner la date réelle', async ({ page }) => {
    await login(page, 'emma');
    await page.goto(`/app/jardins/${CANAL}/cultures`);
    await page.getByTestId('culture-list').getByRole('link', { name: /Carotte Touchon/ }).click();
    await page.getByRole('link', { name: 'Tâches' }).last().click();
    await page.getByRole('link', { name: /Récolter : Carotte Touchon/ }).click();
    await page.getByTestId('status-done').click();
    await page.getByTestId('stage-prompt-confirm').click();
    await expect(page.getByTestId('stage-recorded')).toBeVisible();
  });

  test('[NTF-04] le lien de désinscription d\'un e-mail désactive ce type sans connexion', async ({ browser, page }) => {
    const mail = await waitForMail('david@greenu.test', unique);
    const anonymous = await (await browser.newContext()).newPage();
    await anonymous.goto(linkFrom(mail.text, '/desinscription/'));
    await expect(anonymous.getByTestId('unsubscribed')).toContainText('Tâche assignée');
    await login(page, 'david');
    await page.goto('/app/parametres/notifications');
    await expect(page.getByTestId('pref-assigned-email')).not.toBeChecked();
    await expect(page.getByTestId('pref-assigned-in_app')).toBeChecked();
  });

  test('[NTF-07] « tout marquer comme lu » remet le compteur à zéro', async ({ page }) => {
    await login(page, 'emma');
    await page.goto('/app/notifications');
    await expect(page.getByTestId('unread-count')).not.toHaveText('Tout est lu');
    await page.getByTestId('mark-all-read').click();
    await expect(page.getByTestId('unread-count')).toHaveText('Tout est lu');
    await expect(page.getByTestId('bell-count')).toHaveCount(0);
  });
});
