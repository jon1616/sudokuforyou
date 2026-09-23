/*
  Service worker: rende il gioco installabile e apribile anche senza rete.
  Strategia "prima la rete": se c'è connessione prende sempre la versione
  nuova (così gli aggiornamenti arrivano subito); se non c'è, usa la copia
  salvata l'ultima volta.
*/

const CACHE_VERSION = "0.1.0"; // tenere allineato a js/version.js
const CACHE = `sudokuforyou-${CACHE_VERSION}`;

const PRECACHE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/base.css",
  "./css/game.css",
  "./js/app.js",
  "./js/game.js",
  "./js/icons.js",
  "./js/storage.js",
  "./js/sudoku.js",
  "./js/ui.js",
  "./js/version.js",
  "./fonts/fredoka-latin.woff2",
  "./fonts/fredoka-latin-ext.woff2",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-192.png",
  "./icons/icon-maskable-512.png",
];
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // "reload": ignora la cache HTTP del browser, prende i file freschi dal server
      .then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  // "no-cache": chiede sempre al server se il file è cambiato (risposta
  // minuscola se non lo è), invece di fidarsi della cache HTTP per 10 minuti.
  event.respondWith(
    fetch(request, { cache: "no-cache" })
      .then((response) => {
        if (response.ok && new URL(request.url).origin === self.location.origin) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() =>
        caches.match(request).then((cached) => {
          if (cached) return cached;
          // Offline e non in cache: la pagina di partenza per le navigazioni,
          // "non trovato" per tutto il resto (mai HTML al posto di uno script).
          if (request.mode === "navigate") return caches.match("./index.html");
          return new Response("", { status: 404, statusText: "Offline" });
        })
      )
  );
});
