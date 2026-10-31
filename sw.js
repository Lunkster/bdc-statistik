// Minimal service worker: gör appen installerbar. Inget cachas – data ska alltid vara färsk.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
