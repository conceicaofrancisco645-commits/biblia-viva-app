// Bíblia Viva — Service Worker
// - Arquivos do app: rede primeiro (pega atualizações), cache como reserva offline.
// - Livros da Bíblia (data/books): cache primeiro (não mudam), baixados sob demanda.
// - Fontes do Google: cache com atualização em segundo plano.
const SHELL_CACHE = 'biblia-viva-shell-v4';
const BOOKS_CACHE = 'biblia-viva-books-v2';
const FONTS_CACHE = 'biblia-viva-fonts-v1';
const APP_SHELL = [
  './', 'index.html', 'manifest.json',
  'css/style.css', 'css/components.css', 'css/responsive.css',
  'js/app.bundle.js', 'js/firebase-config.js',
  'data/index.js', 'data/books/joao.js', 'data/books/salmos.js', 'data/books/genesis.js',
  'assets/icons/icon.svg', 'assets/icons/icon-192.png', 'assets/icons/icon-512.png', 'assets/icons/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL_CACHE).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  const keep = [SHELL_CACHE, BOOKS_CACHE, FONTS_CACHE];
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => !keep.includes(k)).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(staleWhileRevalidate(request, FONTS_CACHE));
    return;
  }
  if (url.origin !== self.location.origin) return; // Firebase e outros serviços seguem direto

  if (url.pathname.includes('/data/books/')) {
    event.respondWith(cacheFirst(request, BOOKS_CACHE));
    return;
  }
  event.respondWith(networkFirst(request));
});

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request, { ignoreSearch: true });
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) (await caches.open(cacheName)).put(request, response.clone());
  return response;
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) (await caches.open(SHELL_CACHE)).put(request, response.clone());
    return response;
  } catch {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;
    if (request.mode === 'navigate') return caches.match('index.html');
    return new Response('', { status: 504, statusText: 'Offline' });
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request).then(response => { if (response.ok || response.type === 'opaque') cache.put(request, response.clone()); return response; }).catch(() => cached);
  return cached || network;
}
