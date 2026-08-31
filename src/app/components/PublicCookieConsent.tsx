"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  createConsent,
  getConsent,
  updateConsent,
} from "../../lib/cookieConsent";
import {
  defaultCookieConsentConfig,
  normalizeCookieConsentConfig,
  type CookieConsentConfig,
} from "../../lib/cookieConsentConfig";
import CookieConsentPanel from "./CookieConsentPanel";

export default function PublicCookieConsent() {
  const pathname = usePathname();
  const [config, setConfig] = useState<CookieConsentConfig | null>(null);
  const [mode, setMode] = useState<"banner" | "closed" | "preferences">(
    "closed",
  );
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const isAdmin = pathname.startsWith("/admin");

  useEffect(() => {
    if (isAdmin) {
      setMode("closed");
      return;
    }

    let active = true;

    void fetch("/api/platform-preferences/cookie-consent", {
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Cookie preferences could not be loaded.");
        }

        return response.json() as Promise<{ config?: unknown }>;
      })
      .then((payload) => {
        if (!active) return;

        const nextConfig = normalizeCookieConsentConfig(payload.config);
        const storedConsent = getConsent(nextConfig.consentVersion);

        setConfig(nextConfig);
        setAnalytics(storedConsent?.analytics ?? false);
        setMarketing(storedConsent?.marketing ?? false);
        setMode(nextConfig.enabled && !storedConsent ? "banner" : "closed");
      })
      .catch(() => {
        if (!active) return;

        const nextConfig = defaultCookieConsentConfig;
        const storedConsent = getConsent(nextConfig.consentVersion);

        setConfig(nextConfig);
        setAnalytics(storedConsent?.analytics ?? false);
        setMarketing(storedConsent?.marketing ?? false);
        setMode(nextConfig.enabled && !storedConsent ? "banner" : "closed");
      });

    return () => {
      active = false;
    };
  }, [isAdmin]);

  if (isAdmin || !config || !config.enabled) {
    return null;
  }

  function persistChoices(nextAnalytics: boolean, nextMarketing: boolean) {
    updateConsent(
      createConsent(config!.consentVersion, {
        analytics: nextAnalytics,
        marketing: nextMarketing,
      }),
    );
    setAnalytics(nextAnalytics);
    setMarketing(nextMarketing);
    setMode("closed");
  }

  function openPreferences() {
    if (!config) return;

    const storedConsent = getConsent(config.consentVersion);
    setAnalytics(storedConsent?.analytics ?? false);
    setMarketing(storedConsent?.marketing ?? false);
    setMode("preferences");
  }

  return (
    <>
      {mode !== "closed" && (
        <div
          className={`fixed inset-x-0 bottom-0 z-[100] p-3 sm:p-5 ${
            mode === "preferences"
              ? "inset-y-0 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center"
              : "mx-auto max-w-3xl"
          }`}
        >
          <div className={mode === "preferences" ? "w-full max-w-xl" : "w-full"}>
            <CookieConsentPanel
              analytics={analytics}
              config={config}
              marketing={marketing}
              mode={mode}
              onAcceptAll={() => persistChoices(true, true)}
              onAnalyticsChange={setAnalytics}
              onCancel={() => setMode("closed")}
              onEssentialOnly={() => persistChoices(false, false)}
              onManage={openPreferences}
              onMarketingChange={setMarketing}
              onSave={() => persistChoices(analytics, marketing)}
            />
          </div>
        </div>
      )}

      {mode === "closed" && (
        <button
          type="button"
          onClick={openPreferences}
          className="fixed bottom-3 left-3 z-[90] min-h-11 rounded-lg border border-white/15 bg-black/90 px-3 py-2 text-[0.64rem] font-semibold uppercase tracking-[0.08em] text-zinc-300 shadow-lg transition hover:border-[#D8C36A]/45 hover:text-[#F2D66C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2D66C]"
        >
          {config.footerLinkLabel}
        </button>
      )}
    </>
  );
}
