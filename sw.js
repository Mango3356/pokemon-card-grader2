// GradScan service worker: offline app shell, never caches API calls.
const CACHE = "gml-v9";
const SHELL = ["./", "./index.html", "./iphone.html", "./styles.css", "./app.js", "./scanner.js", "./manifest.webmanifest", "./icon.svg", "./icon-192.png", "./icon-512.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.hostname === "api.anthropic.com") return;
  const sameOrigin = url.origin === location.origin;
  const fonts = url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
  if (!sameOrigin && !fonts) return;
  // network first for the app itself (so updates arrive), cache fallback offline
  e.respondWith(fetch(e.request, sameOrigin ? { cache: "no-cache" } : {}).then(r => { if (r.ok || r.type === "opaque") { const c = r.clone(); caches.open(CACHE).then(cc => cc.put(e.request, c)); } return r; })
    .catch(() => caches.match(e.request).then(m => m || caches.match("./index.html"))));
});
