/* ══════════════════════════════════════════════════════════════════════
   OFFLINE SUPPORT
   The hub keeps working without a connection: the whole app shell is
   cached, the data files come out of the cache and the posters are stored
   the first time they are seen. API calls (the AI chat, Supabase, AniList)
   always go to the network - when there is none, the site still runs.
   ══════════════════════════════════════════════════════════════════════ */
var VERSION = 'fardin-hub-v5';
var IMG_VERSION = 'fardin-img-v1';
var CORE = [
  './',
  './index.html',
  './style.css',
  './chat-styles.css',
  './duel-system.css',
  './tournament.css',
  './anime-games.css',
  './login-otp.css',
  './script.js',
  './duel-system.js',
  './tournament.js',
  './anime-games.js',
  './chat-cloud.js',
  './wishlist.js',
  './anime-fetch.js',
  './quest-data.js',
  './guide-mascot.js',
  './anime-ratings.json',
  './anime-dubs.json',
  './itch-games.json',
  './manifest.json',
  './logo.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(VERSION).then(function (cache) {
      return Promise.all(CORE.map(function (url) {
        return cache.add(new Request(url, { cache: 'reload' })).catch(function () { });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== VERSION && k !== IMG_VERSION) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

function isApi(url) {
  return /supabase\.co|anilist\.co|groq\.com|openai|jikan|r\.jina\.ai|mxplayer|museindia/.test(url.hostname);
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (isApi(url)) return;                    /* always live */

  /* images from the CDN: keep the ones we have seen */
  if (url.origin !== self.location.origin) {
    if (!/\.(png|jpe?g|webp|gif|svg|avif)$/i.test(url.pathname)) return;
    e.respondWith(
      caches.open(IMG_VERSION).then(function (cache) {
        return cache.match(req).then(function (hit) {
          if (hit) return hit;
          return fetch(req).then(function (res) {
            if (res && (res.ok || res.type === 'opaque')) {
              try { cache.put(req, res.clone()); } catch (err) { }
            }
            return res;
          }).catch(function () { return hit; });
        });
      })
    );
    return;
  }

  /* a page: network first, the cached copy when there is no network.
     IMPORTANT: the response is cached under the URL that was requested -
     caching every navigation under './index.html' would poison the app
     shell with the admin page the moment somebody opens it. */
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(function (res) {
        try {
          var copy = res.clone();
          caches.open(VERSION).then(function (c) { c.put(req, copy); });
        } catch (err) { }
        return res;
      }).catch(function () {
        return caches.match(req).then(function (hit) {
          return hit || caches.match('./index.html');
        });
      })
    );
    return;
  }

  /* everything else: the cache first, refreshed in the background */
  e.respondWith(
    caches.match(req).then(function (cached) {
      var net = fetch(req).then(function (res) {
        if (res && res.ok) {
          try {
            var copy = res.clone();
            caches.open(VERSION).then(function (c) { c.put(req, copy); });
          } catch (err) { }
        }
        return res;
      }).catch(function () { return cached; });
      return cached || net;
    })
  );
});
