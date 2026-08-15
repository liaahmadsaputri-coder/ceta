// Naikkan versi ini tiap kali mau paksa semua user pakai app shell terbaru
// (misal abis ganti struktur besar) -- cache lama otomatis kehapus pas SW baru aktif.
const CACHE_VERSION = 'ceta-shell-v1';
const APP_SHELL = ['/', '/manifest.json', '/icon-192.png', '/icon-512.png', '/icon-maskable-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  // Cuma tangani GET ke domain sendiri (app shell: index.html, manifest, icon).
  // Request ke /api/chat (POST, streaming jawaban AI) dan semua request ke
  // domain lain (Firebase, CDN pdf.js/mammoth/xlsx, Google Font) DIBIARKAN
  // lewat langsung ke network, ga disentuh sama sekali -- itu bukan tanggung
  // jawab app-shell caching ini, dan nge-cache jawaban AI/data dinamis jelas salah.
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  // Network-first: selalu coba ambil versi terbaru dulu (biar update ga nyangkut
  // gara-gara cache basi -- penting soalnya deploy-nya sering), baru fallback ke
  // cache kalau lagi offline/network gagal.
  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match('/')))
  );
});
