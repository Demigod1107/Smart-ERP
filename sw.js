const CACHE_NAME = 'smart-school-cache-v5.1-cloudsync';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/period-attendance.html',
  '/subject-attendance.html',
  '/students.html',
  '/reports.html',
  '/calendar.html',
  '/profile.html',
  '/teachers.html',
  '/leaves.html',
  '/timetable.html',
  '/settings-communication.html',
  '/communication-dispatch.html',
  '/settings-database.html',
  '/login.html',
  '/style.css',
  '/script.js',
  '/manifest.json'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch(() => {});
    })
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.url.includes('/api/')) {
    // Network first for API calls with offline fallback
    e.respondWith(
      fetch(e.request).catch(() => {
        return new Response(JSON.stringify({ offline: true }), {
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
  } else {
    // Network first for HTML and JS, falling back to cache
    e.respondWith(
      fetch(e.request)
        .then((response) => {
          if (response && response.status === 200 && e.request.method === 'GET') {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(e.request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          return caches.match(e.request);
        })
    );
  }
});

