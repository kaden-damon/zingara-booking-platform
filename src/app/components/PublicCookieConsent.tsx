"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  cookieConsentReadyEvent,
  createConsent,
  getConsent,
  updateConsent,
  type CookieConsent,
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
  const [consent, setConsent] = useState<CookieConsent | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const isAdmin = pathname.startsWith("/admin");

  useEffect(() => {
    if (isAdmin) {
      setIsVisible(false);
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
        setConsent(storedConsent);
        setIsVisible(nextConfig.enabled && !storedConsent);
        window.dispatchEvent(new CustomEvent(cookieConsentReadyEvent, {
          detail: { analytics: nextConfig.enabled && storedConsent?.analytics === true },
        }));
      })
      .catch(() => {
        if (!active) return;

        const nextConfig = defaultCookieConsentConfig;
        const storedConsent = getConsent(nextConfig.consentVersion);

        setConfig(nextConfig);
        setConsent(storedConsent);
        setIsVisible(nextConfig.enabled && !storedConsent);
        window.dispatchEvent(new CustomEvent(cookieConsentReadyEvent, {
          detail: { analytics: nextConfig.enabled && storedConsent?.analytics === true },
        }));
      });

    return () => {
      active = false;
    };
  }, [isAdmin]);

  if (isAdmin || !config || !config.enabled) {
    return null;
  }

  function acknowledgeNotice() {
    if (!config) return;

    const next = createConsent(config.consentVersion, {
        analytics: false,
        marketing: false,
      });
    updateConsent(next);
    setConsent(next);
    setIsVisible(false);
  }

  function savePreferences(choices: { analytics: boolean; marketing: boolean }) {
    if (!config) return;
    const next = createConsent(config.consentVersion, choices);
    updateConsent(next);
    setConsent(next);
    setIsVisible(false);
  }

  return (
    <>
      {isVisible ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] p-4 sm:p-6">
          <div className="pointer-events-auto mx-auto w-full max-w-md">
            <CookieConsentPanel
              config={config}
              initialChoices={{
                analytics: consent?.analytics === true,
                marketing: consent?.marketing === true,
              }}
              onAcknowledge={acknowledgeNotice}
              onSavePreferences={savePreferences}
            />
          </div>
        </div>
      ) : (
        <div className="w-full border-t border-white/8 bg-black px-4 py-3 text-center">
          <button
            type="button"
            onClick={() => setIsVisible(true)}
            className="text-[10px] font-semibold uppercase tracking-[0.1em] text-zinc-500 underline underline-offset-4 transition hover:text-white"
          >
            {config.footerLinkLabel}
          </button>
        </div>
      )}
    </>
  );
}
