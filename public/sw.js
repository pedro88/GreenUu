/*
 * Service worker de GreenU (SPEC §12.10, OFF-01, OFF-06, OFF-08). Écrit à la main, sans dépendance (écart §18 : Serwist
 * prévu au §3.1). Règles :
 * - pages (navigations) : réseau d'abord ; hors-ligne, la page en cache, sinon la page /hors-ligne ;
 * - `/_next/static` (noms à empreinte, immuables) : cache d'abord ;
 * - sprites, icônes et manifeste (noms stables, contenus livrés à nouveau) : la version en cache tout de suite, et une mise
 *   à jour en arrière-plan pour la visite suivante (stale-while-revalidate, audit lot 9 M1) ;
 * - jamais l'authentification, les fichiers privés (`/api/files`), les requêtes autres que GET ni les autres origines.
 * Les saisies hors-ligne passent par la file IndexedDB de l'app, pas par ce worker.
 *
 * En développement (`/sw.js?dev=1`), le code change sans que les pages changent d'adresse et une page peut mettre
 * plus de 4 s à compiler : les pages attendent le réseau sans délai, et `/_next/static` passe par le réseau d'abord.
 * Le cache ne sert alors que hors-ligne ; sans cela, une page en cache rechargeait l'ancien JS de l'app.
 */
const VERSION = 'v3';
const DEV = new URL(self.location.href).searchParams.has('dev');
const PAGES = `greenu-pages-${VERSION}`;
const STATIC = `greenu-static-${VERSION}`;
const OFFLINE_URL = '/hors-ligne';
const NETWORK_TIMEOUT_MS = 4000;

/** Page hors-ligne et ses scripts et styles : elle doit fonctionner sans réseau (OFF-06). */
async function precacheOfflinePage() {
  const response = await fetch(new Request(OFFLINE_URL, { cache: 'reload' }));
  if (!response.ok) return;
  await (await caches.open(PAGES)).put(OFFLINE_URL, response.clone());
  const html = await response.text();
  const assets = [...new Set([...html.matchAll(/["'](\/_next\/static\/[^"'?#]+)/g)].map((m) => m[1]))];
  const statics = await caches.open(STATIC);
  await Promise.all(assets.map((a) => statics.add(a).catch(() => undefined)));
}

self.addEventListener('install', (event) => {
  event.waitUntil(precacheOfflinePage().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('greenu-') && ![PAGES, STATIC].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const sameOrigin = (url) => url.origin === self.location.origin;
const isPrivate = (url) => url.pathname.startsWith('/api/') || url.pathname.startsWith('/_next/webpack-hmr') || url.pathname.startsWith('/__nextjs');
const isStatic = (url) => url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/sprites/') || url.pathname.startsWith('/icons/') || url.pathname === '/manifest.webmanifest';

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then((r) => { clearTimeout(t); resolve(r); }, (e) => { clearTimeout(t); reject(e); });
  });
}

async function page(request) {
  const cache = await caches.open(PAGES);
  try {
    const response = await (DEV ? fetch(request) : withTimeout(fetch(request), NETWORK_TIMEOUT_MS));
    const url = new URL(response.url || request.url);
    // Session terminée (renvoi vers la connexion) : les pages authentifiées en cache ne doivent plus servir.
    if (url.pathname.startsWith('/connexion')) {
      await clearPages();
    } else if (response.ok && response.type === 'basic' && !response.redirected) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return (await cache.match(request)) ?? (await cache.match(OFFLINE_URL)) ?? Response.error();
  }
}

const isImmutable = (url) => url.pathname.startsWith('/_next/static/');

async function asset(event) {
  const { request } = event;
  const cache = await caches.open(STATIC);
  const hit = await cache.match(request);
  if (DEV && isImmutable(new URL(request.url))) {
    // Développement : le réseau d'abord, le cache seulement hors-ligne.
    try {
      const response = await fetch(request);
      if (response.ok && response.type === 'basic') await cache.put(request, response.clone());
      return response;
    } catch {
      return hit ?? Response.error();
    }
  }
  const refresh = fetch(request).then(async (response) => {
    if (response.ok && response.type === 'basic') await cache.put(request, response.clone());
    return response;
  });
  if (hit && isImmutable(new URL(request.url))) return hit;
  if (hit) {
    // Version en cache tout de suite ; la mise à jour termine même après la réponse.
    event.waitUntil(refresh.catch(() => undefined));
    return hit;
  }
  return refresh;
}

async function clearPages() {
  const c = await caches.open(PAGES);
  for (const key of await c.keys()) if (new URL(key.url).pathname !== OFFLINE_URL) await c.delete(key);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (!sameOrigin(url) || isPrivate(url)) return;
  if (request.mode === 'navigate') event.respondWith(page(request));
  else if (isStatic(url)) event.respondWith(asset(event));
});

self.addEventListener('message', (event) => {
  const data = event.data ?? {};
  // Page vue une seule fois (OFF-01) : le client envoie sa page et les ressources déjà chargées.
  if (data.type === 'warm' && Array.isArray(data.urls)) {
    event.waitUntil((async () => {
      const pages = await caches.open(PAGES);
      const statics = await caches.open(STATIC);
      for (const raw of data.urls.slice(0, 300)) {
        try {
          const url = new URL(raw, self.location.origin);
          if (!sameOrigin(url) || isPrivate(url)) continue;
          if (url.href === data.page) {
            if (!(await pages.match(url.href))) {
              const r = await fetch(url.href, { credentials: 'same-origin' });
              if (r.ok && !r.redirected) await pages.put(url.href, r);
            }
          } else if (isStatic(url) && !(await statics.match(url.href))) {
            const r = await fetch(url.href);
            if (r.ok) await statics.put(url.href, r);
          }
        } catch { /* hors-ligne entre-temps : ignoré */ }
      }
      event.source?.postMessage({ type: 'warmed' });
    })());
  }
  // Déconnexion (OFF-08) : plus aucune page authentifiée en cache.
  if (data.type === 'clear') event.waitUntil(clearPages().then(() => event.source?.postMessage({ type: 'cleared' })));
  // Page hors-ligne (OFF-06) : les pages consultables.
  if (data.type === 'list-pages') {
    event.waitUntil(caches.open(PAGES).then((c) => c.keys()).then((keys) => event.source?.postMessage({
      type: 'pages', urls: keys.map((k) => new URL(k.url)).filter((u) => u.pathname !== OFFLINE_URL).map((u) => u.pathname + u.search),
    })));
  }
});
