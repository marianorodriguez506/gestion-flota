const CACHE_VERSION = "gestion-flota-pwa-v16";
const APP_SHELL = [
  "/",
  "/index.html",
  "/offline.html",
  "/styles.css",
  "/app.js",
  "/supabase-config.js",
  "/manifest.webmanifest",
  "/assets/icons/favicon-cholo-32.png",
  "/assets/icons/apple-touch-icon-cholo.png",
  "/assets/icons/icon-cholo-192.png",
  "/assets/icons/icon-cholo-512.png"
];
const STATIC_HOSTS = new Set(["cdn.jsdelivr.net", "unpkg.com"]);

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const requestUrl = new URL(request.url);
  const isSameOrigin = requestUrl.origin === self.location.origin;
  const isApiRequest = isSameOrigin && requestUrl.pathname.startsWith("/api/");
  const isSupabaseRequest = requestUrl.hostname.includes("supabase.co");
  if (isApiRequest || isSupabaseRequest) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstPage(request));
    return;
  }

  if (isSameOrigin || STATIC_HOSTS.has(requestUrl.hostname)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_error) {
    payload = { body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "Gestion de Flota";
  const options = {
    body: payload.body || "Nueva notificacion",
    icon: payload.icon || "/assets/icons/icon-cholo-192.png",
    badge: payload.badge || "/assets/icons/icon-cholo-192.png",
    vibrate: payload.vibrate || [200, 100, 200],
    tag: payload.tag || "gestion-flota",
    data: {
      url: payload.url || "/",
      notificationId: payload.notificationId || null
    }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => "focus" in client);
      if (existing) {
        existing.navigate(url).catch(() => {});
        return existing.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});

async function networkFirstPage(request) {
  try {
    const response = await fetch(request);
    const cache = await caches.open(CACHE_VERSION);
    cache.put("/index.html", response.clone());
    return response;
  } catch (_error) {
    return (await caches.match("/index.html")) || caches.match("/offline.html");
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request, { ignoreSearch: true });
  const fresh = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);
  return cached || fresh;
}
