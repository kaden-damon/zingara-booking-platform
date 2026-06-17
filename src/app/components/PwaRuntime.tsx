"use client";

import { useEffect } from "react";

function isLocalhost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

function isLocalNetworkHttp() {
  return (
    window.location.protocol !== "https:" &&
    !isLocalhost(window.location.hostname)
  );
}

async function clearServiceWorkerState() {
  if ("caches" in window) {
    const cacheNames = await window.caches.keys();

    await Promise.all(
      cacheNames
        .filter((cacheName) => cacheName.startsWith("zingara-"))
        .map((cacheName) => window.caches.delete(cacheName)),
    );
  }

  if (!("serviceWorker" in navigator)) {
    return false;
  }

  const registrations =
    await navigator.serviceWorker.getRegistrations();

  await Promise.all(
    registrations.map((registration) => registration.unregister()),
  );

  return registrations.length > 0;
}

export default function PwaRuntime() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    if (isLocalNetworkHttp()) {
      void clearServiceWorkerState().then((removedServiceWorker) => {
        if (
          removedServiceWorker &&
          navigator.serviceWorker.controller &&
          !window.sessionStorage.getItem(
            "zingara-local-sw-cleared",
          )
        ) {
          window.sessionStorage.setItem(
            "zingara-local-sw-cleared",
            "true",
          );
          window.location.reload();
        }
      });
      return;
    }

    navigator.serviceWorker
      .register("/sw.js", {
        scope: "/",
        updateViaCache: "none",
      })
      .then((registration) => {
        void registration.update();
      })
      .catch(() => {
        // PWA installability is optional for unsupported contexts.
      });
  }, []);

  return null;
}
