"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { createConsent, getConsent, updateConsent } from "../../lib/cookieConsent";
import {
  defaultCookieConsentConfig,
  normalizeCookieConsentConfig,
  type CookieConsentConfig,
} from "../../lib/cookieConsentConfig";
import CookieConsentPanel from "./CookieConsentPanel";

export default function PublicCookieConsent() {
  const pathname = usePathname();
  const [config, setConfig] = useState<CookieConsentConfig | null>(null);
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
        setIsVisible(nextConfig.enabled && !storedConsent);
      })
      .catch(() => {
        if (!active) return;

        const nextConfig = defaultCookieConsentConfig;
        const storedConsent = getConsent(nextConfig.consentVersion);

        setConfig(nextConfig);
        setIsVisible(nextConfig.enabled && !storedConsent);
      });

    return () => {
      active = false;
    };
  }, [isAdmin]);

  if (isAdmin || !config || !config.enabled || !isVisible) {
    return null;
  }

  function acknowledgeNotice() {
    if (!config) return;

    updateConsent(
      createConsent(config.consentVersion, {
        analytics: false,
        marketing: false,
      }),
    );
    setIsVisible(false);
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] p-4 sm:p-6">
      <div className="pointer-events-auto mx-auto w-full max-w-md">
        <CookieConsentPanel
          config={config}
          onAcknowledge={acknowledgeNotice}
        />
      </div>
    </div>
  );
}
