/* ══════════════════════════════════════════════════════════════════════
   OFFLINE SUPPORT
   The hub keeps working without a connection: the whole app shell is
   cached, the data files come out of the cache and the posters are stored
   the first time they are seen. API calls (the AI chat, Supabase, AniList)
   always go to the network - when there is none, the site still runs.
   ══════════════════════════════════════════════════════════════════════ */
var VERSION = 'fardin-hub-v56';
var IMG_VERSION = 'fardin-img-v1';
var CORE = [
  './',
  './index.html',
  './style.css',
  './features.css',
  './chat-styles.css',
  './duel-system.css',
  './tournament.css',
  './anime-games.css',
  './login-otp.css',
  './search-suggest.css',
  './script.js',
  './tierlist.js',
  './seasonal.js',
  './stickmen.js',
  './shortcuts.js',
  './perf-guard.js',
  './duel-system.js',
  './tournament.js',
  './game-data.js',
  './game-data-extra.js',
  './game-data-facts.js',
  './anime-search.js',
  './anime-games.js',
  './chat-cloud.js',
  './wishlist.js',
  './anime-fetch.js',
  './quest-data.js',
  './guide-mascot.js',
  './site-knowledge.js',
  './site-knowledge.json',
  './anime-data.js',
  './watch-links.js',
  './anime-ratings.json',
  './anime-dubs.json',
  './itch-games.json',
  './manifest.json',
  './logo.png',
  './logo-2.png',
  './login-otp.js',
  './privacy.html',
  './terms.html'
];

/* Versioned URLs (script.js?v=…) must still find the unversioned copy
   that install() puts in the cache. Without this, every asset looked
   missing offline even though the whole app shell had been cached. */
function cacheMatch(req) {
  return caches.match(req, { ignoreSearch: true });
}

function staticKey(url) {
  return new Request(url.origin + url.pathname);
}

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
  return /supabase\.co|anilist\.co|groq\.com|openai|jikan|kitsu\.io|tvmaze\.com|wikipedia\.org|r\.jina\.ai|mxplayer|museindia/.test(url.hostname);
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (isApi(url)) return;                    /* always live */

  /* the build stamp is how the page learns a new deploy landed - it has to
     come from the network, never from a cache */
  if (/\/version\.json$/.test(url.pathname)) {
    e.respondWith(fetch(req, { cache: 'no-store' }).catch(function () {
      return new Response('{}', { headers: { 'Content-Type': 'application/json' } });
    }));
    return;
  }

  /* images from the CDN: keep the ones we have seen */
  if (url.origin !== self.location.origin) {
    if (!/\.(png|jpe?g|webp|gif|svg|avif)$/i.test(url.pathname)) return;
    e.respondWith(
      caches.open(IMG_VERSION).then(function (cache) {
        return cache.match(req, { ignoreSearch: true }).then(function (hit) {
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
      fetch(req, { cache: 'no-cache' }).then(function (res) {
        try {
          var copy = res.clone();
          caches.open(VERSION).then(function (c) { c.put(req, copy); });
        } catch (err) { }
        return res;
      }).catch(function () {
        return cacheMatch(req).then(function (hit) {
          return hit || cacheMatch('./index.html');
        });
      })
    );
    return;
  }

  /* everything else: the cache first, refreshed in the background.
     Store under the path without ?v=… so a version bump REPLACES the old
     copy instead of leaving several stale ones behind. */
  var key = staticKey(url);
  e.respondWith(
    cacheMatch(key).then(function (hit) {
      var net = fetch(req).then(function (res) {
        if (res && res.ok) {
          try {
            var copy = res.clone();
            caches.open(VERSION).then(function (c) { c.put(key, copy); });
          } catch (err) { }
        }
        return res;
      }).catch(function () { return hit; });
      return hit || net;
    })
  );
});
