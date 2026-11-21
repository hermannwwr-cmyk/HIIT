// Offline support for Overdrive HIIT. Every URL here is relative, so it works from the GitHub Pages sub-path.
//
// One version = one cache. The Pages workflow replaces the VERSION line below with the commit SHA, so every
// deploy is a new worker with a new cache; the file in the repo keeps 'dev'.
//
// How a version stays whole (never a fresh index.html with older scripts, or the other way round):
//   * install downloads the whole shell straight from the server (never from the HTTP cache) into this
//     version's own cache, and fails as a whole if any file fails;
//   * a stamped worker answers the page and everything the page loads from that one cache, without asking
//     the network: what the server holds by then no longer matters;
//   * a new worker never takes over on its own (no skipWaiting() at install, no clients.claim()): it waits
//     until every window of the app is closed, so a running workout keeps the worker and the cache it
//     started with. The next launch gets the new worker, which then deletes the older caches.
//   * the page decides when: it sends 'activate-now' once a new worker has finished downloading, or when the
//     app opens or comes back to the foreground and finds one waiting, but only on the setup screen, and
//     then reloads once into the new version (see index.html). During a workout it does not ask.
// The browser looks for a new sw.js on every launch; the page also asks when it comes back to the foreground.
//
// Un-stamped ('dev', i.e. served straight from the repo on localhost): the network comes first, so an edit
// shows on reload; the cache is refreshed as files go by and is only what a reload falls back to when the
// server is gone. (This is also what a Pages "deploy from a branch" gets, without the workflow's stamp.)
var VERSION = 'dev'; // @@VERSION@@ (stamped by .github/workflows/pages.yml)

var PREFIX = 'overdrive-hiit-';
var CACHE = PREFIX + VERSION;
var DEV = VERSION === 'dev';
var TIMEOUT = 3000; // ms a network answer may take before the cache is used instead

// The app shell: what index.html loads. tests/site.test.js checks this list against index.html and the workflow.
var SHELL = [
  'index.html',
  'css/style.css',
  'css/studio.css',
  'js/workout.js',
  'js/bg.js',
  'js/audio.js',
  'js/figure.js',
  'js/app.js',
  'fonts/geist-latin.woff2',
  'manifest.webmanifest',
  'icons/favicon.svg',
  'icons/favicon-32.png',
  'icons/apple-touch-icon.png'
];

var SCOPE = new URL('./', self.location.href).href; // …/HIIT/
var INDEX = new URL('index.html', SCOPE).href;
var SHELL_URLS = SHELL.map(function (path) { return new URL(path, SCOPE).href; });

self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(CACHE).then(function (cache) {
    return Promise.all(SHELL.map(function (path) {
      // ?v= and no-store: this deploy's file from the server, past the HTTP cache and any CDN copy of the plain URL
      return fetch(new URL(path + '?v=' + encodeURIComponent(VERSION), SCOPE).href, { cache: 'no-store' }).then(function (res) {
        if (!res.ok) throw new Error(path + ': ' + res.status);
        return cache.put(new URL(path, SCOPE).href, res);
      });
    }));
  }).catch(function (err) {
    // half a shell is worse than none: drop it, fail the install, and the browser retries on a later launch
    return caches.delete(CACHE).then(function () { throw err; });
  }));
});

self.addEventListener('activate', function (event) {
  // only reached once no window is using an older worker any more
  event.waitUntil(caches.keys().then(function (names) {
    return Promise.all(names.map(function (name) {
      return name.indexOf(PREFIX) === 0 && name !== CACHE ? caches.delete(name) : null;
    }));
  }));
});

self.addEventListener('message', function (event) {
  if (event.data === 'activate-now') self.skipWaiting();
});

function cached(key) {
  return caches.open(CACHE).then(function (cache) { return cache.match(key); });
}

// The network's answer, or a rejection after TIMEOUT ms, on an error or on a server error status.
function fromNetwork(request) {
  return new Promise(function (resolve, reject) {
    var timer = setTimeout(function () { reject(new Error('timeout')); }, TIMEOUT);
    fetch(request).then(function (res) {
      clearTimeout(timer);
      if (res.status >= 500) reject(new Error('status ' + res.status)); else resolve(res);
    }, function (err) { clearTimeout(timer); reject(err); });
  });
}

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  var plain = url.origin + url.pathname; // the page may carry ?look=… and the like
  var key = plain === SCOPE ? INDEX : plain;

  if (DEV) {
    event.respondWith(fromNetwork(req).then(function (res) {
      // keep the offline copy current: sw.js itself never changes here, so there is no new install to do it
      if (res.ok && SHELL_URLS.indexOf(key) >= 0) {
        var copy = res.clone();
        event.waitUntil(caches.open(CACHE).then(function (cache) { return cache.put(key, copy); }));
      }
      return res;
    }, function (err) {
      return cached(key).then(function (hit) { if (hit) return hit; throw err; });
    }));
    return;
  }
  event.respondWith(cached(key).then(function (hit) {
    if (hit) return hit;
    // Not part of the shell (dev pages, the larger icons), or the browser evicted the cache.
    // The page itself then comes from the network, with nothing to fall back to.
    return fetch(req);
  }));
});
