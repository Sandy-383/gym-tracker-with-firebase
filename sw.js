/* Gym Tracker service worker.
 *
 * Two strategies, deliberately different:
 *
 *   App files (same-origin HTML/CSS/JS/icons) -> network-first with a timeout,
 *   falling back to cache. Keeps you from ever running a stale mix of old JS
 *   against new HTML, while still opening fully offline.
 *
 *   Vendor scripts (version-pinned CDN URLs) -> cache-first. The URL contains
 *   the version, so the bytes behind it never change; re-fetching them on every
 *   launch would just be slow.
 *
 * Nothing else is touched. Firebase auth and Realtime Database traffic must
 * always reach the network — caching it would serve stale sessions and data.
 */

const VERSION = 'v1';
const APP_CACHE = 'gym-app-' + VERSION;
const VENDOR_CACHE = 'gym-vendor-' + VERSION;
const NETWORK_TIMEOUT_MS = 3500;

// Relative to the worker's own scope, so this works under /<repo>/ on Pages.
const APP_SHELL = [
    './',
    'index.html',
    'styles.css',
    'script.js',
    'firebase-config.js',
    'manifest.webmanifest',
    'icons/icon-192.png',
    'icons/icon-512.png',
    'icons/icon-180.png'
];

const VENDOR_HOSTS = ['cdn.jsdelivr.net', 'www.gstatic.com'];

// Live traffic — never intercepted.
const BYPASS_PATTERNS = [
    'firebaseio.com',
    'firebasedatabase.app',
    'googleapis.com',
    'firebaseapp.com',
    'google-analytics.com',
    'googletagmanager.com'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(APP_CACHE)
            // Individually, so one 404 can't fail the whole install.
            .then(cache => Promise.all(
                APP_SHELL.map(url => cache.add(new Request(url, { cache: 'reload' })).catch(err => {
                    console.warn('[sw] could not precache', url, err);
                }))
            ))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(k => k !== APP_CACHE && k !== VENDOR_CACHE).map(k => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const request = event.request;

    // Only GETs are cacheable; everything else goes straight through.
    if (request.method !== 'GET') return;

    const url = new URL(request.url);

    if (BYPASS_PATTERNS.some(pattern => url.hostname.indexOf(pattern) !== -1)) return;

    if (VENDOR_HOSTS.indexOf(url.hostname) !== -1) {
        event.respondWith(cacheFirst(request, VENDOR_CACHE));
        return;
    }

    if (url.origin === self.location.origin) {
        event.respondWith(networkFirst(request, APP_CACHE));
    }
});

function cacheFirst(request, cacheName) {
    return caches.match(request).then(hit => {
        if (hit) return hit;
        return fetch(request).then(response => {
            if (response && (response.ok || response.type === 'opaque')) {
                const copy = response.clone();
                caches.open(cacheName).then(cache => cache.put(request, copy)).catch(() => {});
            }
            return response;
        });
    });
}

function networkFirst(request, cacheName) {
    return new Promise(resolve => {
        let settled = false;
        const finish = response => { if (!settled) { settled = true; resolve(response); } };

        // A hanging connection is worse than a slightly stale page.
        const timer = setTimeout(() => {
            caches.match(request).then(hit => { if (hit) finish(hit); });
        }, NETWORK_TIMEOUT_MS);

        fetch(request).then(response => {
            clearTimeout(timer);
            if (response && response.ok) {
                const copy = response.clone();
                caches.open(cacheName).then(cache => cache.put(request, copy)).catch(() => {});
            }
            finish(response);
        }).catch(() => {
            clearTimeout(timer);
            caches.match(request).then(hit => {
                if (hit) return finish(hit);
                // A navigation with nothing cached still needs the shell.
                if (request.mode === 'navigate') {
                    return caches.match('index.html').then(shell => {
                        finish(shell || Response.error());
                    });
                }
                finish(Response.error());
            });
        });
    });
}
