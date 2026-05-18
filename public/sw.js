const CACHE_NAME = "zingara-pwa-shell-v2";
const APP_SHELL_URLS = ["/", "/book", "/admin"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const responseCopy = response.clone();

          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseCopy);
          });

          return response;
        })
        .catch(() =>
          caches.match(request).then((cachedResponse) => {
            return (
              cachedResponse ||
              caches.match("/book") ||
              caches.match("/") ||
              Response.error()
            );
          }),
        ),
    );
    return;
  }

  if (["script", "style", "worker"].includes(request.destination)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const responseCopy = response.clone();

            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseCopy);
            });
          }

          return response;
        })
        .catch(() => caches.match(request).then((cachedResponse) => {
          return cachedResponse || Response.error();
        })),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(request).then((response) => {
        if (
          response.ok &&
          ["style", "script", "image", "font"].includes(
            request.destination,
          )
        ) {
          const responseCopy = response.clone();

          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseCopy);
          });
        }

        return response;
      });
    }),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "ZINGARA_SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.__ZINGARA_PUSH_FOUNDATION__ = {
  ready: true,
  version: "future-push-v1",
};
