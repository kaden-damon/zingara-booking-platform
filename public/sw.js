const CACHE_PREFIX = "zingara-";
const CACHE_NAME = "zingara-pwa-runtime-v4";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME,
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", () => {
  return;
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "ZINGARA_SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  event.waitUntil(
    self.clients
      .matchAll({
        includeUncontrolled: true,
        type: "window",
      })
      .then((clients) => {
        const appClient = clients.find((client) =>
          client.url.includes(self.location.origin),
        );

        if (appClient) {
          return appClient.focus();
        }

        return self.clients.openWindow("/book");
      }),
  );
});

self.__ZINGARA_PUSH_FOUNDATION__ = {
  ready: true,
  version: "future-push-v2",
};
