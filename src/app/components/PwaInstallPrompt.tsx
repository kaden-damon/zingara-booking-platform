"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function getInstallState() {
  if (typeof window === "undefined") {
    return {
      isIOS: false,
      isStandalone: false,
      showIOSHint: false,
    };
  }

  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in window.navigator &&
      window.navigator.standalone === true);
  const isiOSDevice =
    /iPad|iPhone|iPod/.test(window.navigator.userAgent) &&
    !window.navigator.userAgent.includes("MSStream");

  return {
    isIOS: isiOSDevice,
    isStandalone: standalone,
    showIOSHint: isiOSDevice && !standalone,
  };
}

export default function PwaInstallPrompt() {
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showIOSHint, setShowIOSHint] = useState(false);

  useEffect(() => {
    let handleControllerChange: (() => void) | null = null;
    const installStateTimer = window.setTimeout(() => {
      const installState = getInstallState();

      setIsIOS(installState.isIOS);
      setIsStandalone(installState.isStandalone);
      setShowIOSHint(installState.showIOSHint);
    }, 0);

    if ("serviceWorker" in navigator) {
      let refreshingForNewWorker = false;

      handleControllerChange = () => {
        if (refreshingForNewWorker) {
          return;
        }

        refreshingForNewWorker = true;

        if (
          !window.sessionStorage.getItem(
            "zingara-service-worker-refresh",
          )
        ) {
          window.sessionStorage.setItem(
            "zingara-service-worker-refresh",
            "true",
          );
          window.location.reload();
        }
      };

      navigator.serviceWorker.addEventListener(
        "controllerchange",
        handleControllerChange,
      );

      navigator.serviceWorker
        .register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        })
        .then((registration) => {
          void registration.update();
          registration.waiting?.postMessage({
            type: "ZINGARA_SKIP_WAITING",
          });
          registration.addEventListener("updatefound", () => {
            const nextWorker = registration.installing;

            nextWorker?.addEventListener("statechange", () => {
              if (nextWorker.state === "installed") {
                nextWorker.postMessage({
                  type: "ZINGARA_SKIP_WAITING",
                });
              }
            });
          });
          window.dispatchEvent(
            new CustomEvent("zingara-pwa-ready", {
              detail: {
                hasPushManager: "PushManager" in window,
                registration,
              },
            }),
          );
        })
        .catch(() => {
          window.dispatchEvent(new CustomEvent("zingara-pwa-error"));
        });
    }

    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    }

    function handleAppInstalled() {
      setInstallPrompt(null);
      setShowIOSHint(false);
      setIsStandalone(true);
    }

    window.addEventListener(
      "beforeinstallprompt",
      handleBeforeInstallPrompt,
    );
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt,
      );
      window.removeEventListener("appinstalled", handleAppInstalled);
      if (handleControllerChange && "serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener(
          "controllerchange",
          handleControllerChange,
        );
      }
      window.clearTimeout(installStateTimer);
    };
  }, []);

  async function installApp() {
    if (!installPrompt) {
      return;
    }

    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  }

  if (isStandalone || (!installPrompt && !showIOSHint)) {
    return null;
  }

  return (
    <aside className="pointer-events-none fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md text-white">
      <div className="pointer-events-none flex flex-col gap-3 rounded-2xl border border-[#D8C36A]/35 bg-black/95 p-4 shadow-2xl shadow-[#8D7A2F]/20 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#D8C36A]">
            Zingara App
          </p>
          <p className="mt-1 text-sm text-zinc-300">
            Install for quick mobile access.
          </p>
          {isIOS && (
            <p className="mt-2 text-xs text-zinc-500">
              On iPhone, use Share, then Add to Home Screen.
            </p>
          )}
        </div>

        <div className="flex gap-2">
          {installPrompt && (
            <button
              type="button"
              onClick={installApp}
              className="pointer-events-auto rounded-full bg-[#D8C36A] px-4 py-2 text-sm font-semibold text-black transition hover:bg-[#F2D66C]"
            >
              Install
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setInstallPrompt(null);
              setShowIOSHint(false);
            }}
            className="pointer-events-auto rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-zinc-300 transition hover:bg-white hover:text-black"
          >
            Later
          </button>
        </div>
      </div>
    </aside>
  );
}
