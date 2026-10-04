import { expect, test, type Page } from '@playwright/test';
import { harvestCount, journalCountByBody, placedEntities, setCultureDeleted } from './db';
import { gardenId } from './ids';
import { login } from './helpers';

const TILLEULS = gardenId('tilleuls');
/** Caches du service worker (`public/sw.js`, VERSION). */
const PAGES = 'greenu-pages-v2';
const STATIC = 'greenu-static-v2';

/**
 * Le service worker est actif et a mis en cache la page courante (OFF-01 : chargée une seule fois). Il ne contrôle la
 * page déjà ouverte qu'à la navigation suivante (rechargement, autre page), ce qui suffit au hors-ligne.
 */
async function swReady(page: Page) {
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.active?.state ?? null), { timeout: 20_000 }).toBe('activated');
  await expect.poll(() => page.evaluate(async (name) => {
    const c = await caches.open(name);
    return (await c.match(location.href)) !== undefined;
  }, PAGES), { timeout: 20_000 }).toBe(true);
}

async function culturePage(page: Page) {
  const { cultures } = await placedEntities(TILLEULS);
  const id = cultures[0] ?? '';
  await page.goto(`/app/jardins/${TILLEULS}/cultures/${id}`);
  return id;
}

async function observe(page: Page, body: string) {
  await page.getByTestId('quick-open').click();
  await page.getByTestId('quick-observation').click();
  await page.getByTestId('quick-note').fill(body);
  await page.getByTestId('quick-save').click();
  await expect(page.getByTestId('quick-done')).toContainText('Hors ligne');
  await page.keyboard.press('Escape');
}

test.describe('hors-ligne', () => {
  test('[OFF-01] la vue jardin chargée une fois s\'affiche depuis le cache, réseau coupé et page rechargée', async ({ page, context }) => {
    await login(page, 'alice');
    await page.goto(`/app/jardins/${TILLEULS}?vue=jardin`);
    await expect(page.getByTestId('garden-view')).toHaveAttribute('data-canvas', 'ready');
    await swReady(page);
    // Atlas des sprites essentiels en cache.
    await expect.poll(() => page.evaluate(async (name) => (await (await caches.open(name)).keys()).some((r) => r.url.includes('/sprites/atlas/')), STATIC), { timeout: 20_000 }).toBe(true);
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByTestId('garden-view')).toBeVisible();
    // Le plan (couche accessible des zones) vient du cache.
    const { zones } = await placedEntities(TILLEULS);
    await expect(page.getByTestId(`zone-${zones[0]}`)).toHaveCount(1);
    // Le canvas exige le module PixiJS chargé à la demande : en build de production (CI), c'est un fichier statique en
    // cache ; sous `next dev`, Turbopack le charge par son serveur de développement, injoignable hors-ligne.
    if (process.env.CI) await expect(page.getByTestId('garden-view')).toHaveAttribute('data-canvas', 'ready');
    await context.setOffline(false);
  });

  test('[OFF-02] hors-ligne, une observation et une récolte sont mises en file, comptées, puis envoyées au retour du réseau, sans doublon', async ({ page, context }) => {
    const tag = Date.now().toString(36);
    const body = `Pucerons sous les feuilles basses ${tag}`;
    // Quantité propre à ce test : la récolte est retrouvée en base sans ambiguïté.
    const qty = Number(`7.${(Date.now() % 900) + 100}`);
    await login(page, 'alice');
    const cultureId = await culturePage(page);
    await swReady(page);
    await context.setOffline(true);
    await observe(page, body);
    await page.getByTestId('quick-open').click();
    await page.getByTestId('quick-harvest').click();
    await page.getByTestId('quick-qty-input').fill(String(qty).replace('.', ','));
    await page.getByTestId('quick-harvest-save').click();
    await expect(page.getByTestId('quick-done')).toContainText('Hors ligne');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('offline-pending')).toHaveAttribute('data-count', '2');
    expect(await journalCountByBody(body)).toBe(0);
    await context.setOffline(false);
    await expect(page.getByTestId('offline-badge')).toHaveCount(0, { timeout: 20_000 });
    expect(await journalCountByBody(body)).toBe(1);
    expect(await harvestCount(cultureId, qty)).toBe(1);
  });

  test('[OFF-05] une saisie refusée au rejeu (culture supprimée entre-temps) reste « à revoir », puis peut être abandonnée', async ({ page, context }) => {
    const body = `Observation orpheline ${Date.now().toString(36)}`;
    await login(page, 'alice');
    const cultureId = await culturePage(page);
    await swReady(page);
    await context.setOffline(true);
    await observe(page, body);
    try {
      await setCultureDeleted(cultureId, true);
      await context.setOffline(false);
      await expect(page.getByTestId('offline-rejected')).toHaveAttribute('data-count', '1', { timeout: 20_000 });
      await page.getByTestId('offline-badge').click();
      const item = page.getByTestId('offline-panel').locator('[data-status="rejected"]');
      await expect(item).toContainText('Culture introuvable');
      expect(await journalCountByBody(body)).toBe(0);
      await item.getByRole('button', { name: 'Abandonner' }).click();
      await expect(page.getByTestId('offline-badge')).toHaveCount(0);
    } finally {
      await setCultureDeleted(cultureId, false);
    }
  });

  test('[OFF-06] hors-ligne, une page jamais visitée affiche la page hors-ligne : pages consultables et saisies en attente', async ({ page, context }) => {
    await login(page, 'alice');
    await culturePage(page);
    await swReady(page);
    const visited = new URL(page.url()).pathname;
    await context.setOffline(true);
    await observe(page, `En attente ${Date.now().toString(36)}`);
    await page.goto('/app/plantes').catch(() => undefined);
    await expect(page.getByRole('heading', { level: 1, name: 'Hors ligne' })).toBeVisible();
    // Compteur et liste viennent du JavaScript de la page : en build de production (CI), ses fichiers sont en cache ;
    // sous `next dev`, Turbopack ne l'hydrate pas sans son serveur de développement.
    if (process.env.CI) {
      await expect(page.getByTestId('offline-page-pending')).toHaveAttribute('data-count', '1');
      await expect(page.getByTestId('offline-pages')).toContainText(visited);
    }
    await context.setOffline(false);
  });

  test('[OFF-08] à la déconnexion, les pages authentifiées en cache et la file sont vidées', async ({ page }) => {
    await login(page, 'alice');
    await culturePage(page);
    await swReady(page);
    await page.goto('/app/parametres/compte');
    // Une saisie restée en file sur l'appareil (refusée, à revoir) au moment de la déconnexion.
    await page.evaluate(() => new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('greenu-offline', 1);
      req.onupgradeneeded = () => { req.result.createObjectStore('outbox', { keyPath: 'id' }); };
      req.onsuccess = () => {
        const tx = req.result.transaction('outbox', 'readwrite');
        tx.objectStore('outbox').put({ id: crypto.randomUUID(), kind: 'journal', input: {}, label: 'Observation privée', createdAt: new Date().toISOString(), status: 'rejected', error: 'cultureNotFound' });
        // Même canal que la file de l'app : le compteur se met à jour.
        tx.oncomplete = () => { new BroadcastChannel('greenu-offline').postMessage('changed'); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
    }));
    await expect(page.getByTestId('offline-rejected')).toHaveAttribute('data-count', '1');
    await page.getByTestId('sign-out').click();
    await page.waitForURL(/\/connexion/);
    const left = await page.evaluate(async () => {
      const urls: string[] = [];
      for (const name of await caches.keys()) for (const r of await (await caches.open(name)).keys()) urls.push(new URL(r.url).pathname);
      const queued = await new Promise<number>((resolve) => {
        const req = indexedDB.open('greenu-offline', 1);
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('outbox')) { resolve(0); return; }
          const c = db.transaction('outbox').objectStore('outbox').count();
          c.onsuccess = () => resolve(c.result);
        };
        req.onerror = () => resolve(-1);
      });
      return { pages: urls.filter((p) => p.startsWith('/app')), queued };
    });
    expect(left).toEqual({ pages: [], queued: 0 });
  });

  test('un sprite en cache est servi tout de suite puis revalidé : une nouvelle livraison atteint l\'appareil (audit lot 9, M1)', async ({ page }) => {
    await login(page, 'alice');
    await culturePage(page);
    await swReady(page);
    // La page suivante est contrôlée par le service worker.
    await page.reload();
    await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
    // Une « ancienne livraison » de l'atlas reste dans le cache de l'appareil.
    await page.evaluate(async (name) => {
      await (await caches.open(name)).put('/sprites/atlas/atlas.json', new Response('{"ancienne":true}', { headers: { 'content-type': 'application/json' } }));
    }, STATIC);
    // Servie tout de suite (pas d'attente du réseau)…
    expect(await page.evaluate(() => fetch('/sprites/atlas/atlas.json').then((r) => r.text()))).toBe('{"ancienne":true}');
    // …puis remplacée par la version du serveur, sans changer la version du service worker.
    await expect.poll(() => page.evaluate(async (name) => (await (await (await caches.open(name)).match('/sprites/atlas/atlas.json'))?.text()) ?? '', STATIC), { timeout: 20_000 })
      .toContain('"frames"');
  });

  test('une observation qui atteint le serveur mais perd sa réponse est rejouée sans doublon (E2E-OFF-03b)', async ({ page }) => {
    const body = `Réponse perdue ${Date.now().toString(36)}`;
    await login(page, 'alice');
    await culturePage(page);
    // Le serveur reçoit et enregistre la saisie, mais la réponse n'arrive jamais au navigateur.
    let lost = false;
    await page.route('**/*', async (route) => {
      const req = route.request();
      if (lost || req.method() !== 'POST' || !req.headers()['next-action'] || !(req.postData() ?? '').includes(body)) return route.continue();
      lost = true;
      await route.fetch();
      await route.abort('internetdisconnected');
    });
    await observe(page, body);
    await expect(page.getByTestId('offline-pending')).toHaveAttribute('data-count', '1');
    expect(await journalCountByBody(body)).toBe(1);
    // Retour à la normale : la file rejoue la saisie avec le même ID client, que le serveur reconnaît.
    await page.unrouteAll({ behavior: 'wait' });
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(page.getByTestId('offline-badge')).toHaveCount(0, { timeout: 20_000 });
    expect(await journalCountByBody(body)).toBe(1);
  });

});
