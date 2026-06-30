const CACHE_PREFIX = "zingara-";
const CACHE_NAME = "zingara-pwa-runtime-v5";

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

self.addEventListener("push", (event) => {
  let payload = {
    body: "Your Zingara reservation has been updated.",
    tag: "zingara-push-notification",
    title: "The Royal Countess Zingara",
    url: "/book",
  };

  if (event.data) {
    try {
      payload = {
        ...payload,
        ...event.data.json(),
      };
    } catch {
      payload.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      badge: "/apple-icon",
      body: payload.body,
      data: {
        url: payload.url,
      },
      icon: "/icon",
      tag: payload.tag,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(
    event.notification.data?.url ?? "/book",
    self.location.origin,
  ).href;

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
          appClient.postMessage({
            type: "ZINGARA_NOTIFICATION_NAVIGATE",
            url: targetUrl,
          });

          return appClient.focus();
        }

        return self.clients.openWindow(targetUrl);
      }),
  );
});

self.__ZINGARA_PUSH_FOUNDATION__ = {
  ready: true,
  version: "future-push-v3",
};
