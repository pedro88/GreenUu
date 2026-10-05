import { expect, test } from '@playwright/test';
import { gardenId, zoneId } from './ids';
import { login } from './helpers';

/* Histoire du jardin (SPEC §12.11) : sur les Tilleuls, trois saisons de cultures du seed. */

const HISTORY = `/app/jardins/${gardenId('tilleuls')}/histoire`;

test.describe('histoire du jardin', () => {
  test('un non-membre connecté qui ouvre /histoire reçoit la page 403, sans aucune donnée du jardin dans le HTML (E2E-TLP-05b)', async ({ page }) => {
    await login(page, 'hugo');
    const res = await page.goto(HISTORY);
    await expect(page.getByTestId('page-403')).toBeVisible();
    // La page transporte tout l'historique dans ses props : rien ne doit partir, même hors du texte visible.
    const html = (await res?.text()) ?? '';
    for (const leak of ['Les Tilleuls', 'Planche 1', 'Noire de Crimée', zoneId('tilleuls', 'p1')]) expect(html, leak).not.toContain(leak);
  });

  test('hors animations réduites, l\'histoire se lit toute seule, et Pause l\'arrête (E2E-TLP-08)', async ({ page }) => {
    await page.clock.install();
    await login(page, 'alice');
    await page.goto(HISTORY);
    const history = page.getByTestId('history');
    await expect(history).toHaveAttribute('data-canvas', 'ready');
    await expect(history).toHaveAttribute('data-playing', 'true');
    const start = Number(await history.getAttribute('data-index'));
    await page.clock.runFor(1_000);
    await expect.poll(async () => Number(await history.getAttribute('data-index'))).toBeGreaterThan(start + 2);
    await page.getByTestId('history-play').click();
    await expect(history).toHaveAttribute('data-playing', 'false');
    const paused = await history.getAttribute('data-index');
    await page.clock.runFor(1_000);
    await expect(history).toHaveAttribute('data-index', paused ?? '');
  });

  test('[TLP-07] [TLP-03] une image par semaine, la date et la saison affichées ; au pas d\'un mois, moins d\'images ; avant le premier instantané, un bandeau', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await login(page, 'alice');
    await page.goto(HISTORY);
    const history = page.getByTestId('history');
    await expect(history).toHaveAttribute('data-canvas', 'ready');
    const weeks = Number(await history.getAttribute('data-frames'));
    expect(weeks).toBeGreaterThan(20);
    expect(weeks).toBeLessThanOrEqual(160);
    // La première image est antérieure à tout instantané du plan : plan actuel, bandeau.
    await expect(history).toHaveAttribute('data-reconstructed', 'true');
    await expect(page.getByTestId('history-reconstructed')).toContainText('Plan reconstitué à partir du plan actuel');
    const first = await history.getAttribute('data-date');
    await page.getByTestId('history-next').click();
    await expect(history).not.toHaveAttribute('data-date', first ?? '');
    // Sept jours plus tard, et la date est annoncée avec la saison.
    expect(Date.parse(`${await history.getAttribute('data-date')}T12:00:00Z`) - Date.parse(`${first}T12:00:00Z`)).toBe(7 * 86_400_000);
    await expect(page.getByTestId('history-date')).toHaveText(/\d{4} · (Printemps|Été|Automne|Hiver)/);
    await page.getByTestId('history-step').selectOption('month');
    expect(Number(await history.getAttribute('data-frames'))).toBeLessThan(weeks);
  });

  test('[TLP-06] animations réduites : pas de lecture automatique, image par image au clavier', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await login(page, 'alice');
    await page.goto(HISTORY);
    const history = page.getByTestId('history');
    await expect(history).toHaveAttribute('data-canvas', 'ready');
    await expect(history).toHaveAttribute('data-playing', 'false');
    await expect(history).toHaveAttribute('data-index', '0');
    await page.getByTestId('history-timeline').focus();
    await page.keyboard.press('ArrowRight');
    await expect(history).toHaveAttribute('data-index', '1');
    await page.keyboard.press('ArrowRight');
    await expect(history).toHaveAttribute('data-index', '2');
    await expect(history).toHaveAttribute('data-playing', 'false');
  });
});
