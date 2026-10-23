"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  cookieConsentChangedEvent,
  cookieConsentReadyEvent,
  type CookieConsent,
} from "@/lib/cookieConsent";
import {
  applyAdvertisingConsent,
  canRetryAdvertisingPurchaseVerification,
  trackAdvertisingPageView,
  trackVerifiedAdvertisingPurchase,
} from "@/lib/advertisingTracking";
import { getBookingJourneyId } from "@/lib/browserPlatformTelemetry";

type ConsentDetail = Pick<CookieConsent, "analytics" | "marketing">;

export default function PublicAdvertisingTracking() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname.startsWith("/admin")) return;

    function handleConsent(event: Event) {
      const detail = (event as CustomEvent<Partial<ConsentDetail>>).detail;
      applyAdvertisingConsent({
        analytics: detail?.analytics === true,
        marketing: detail?.marketing === true,
      });
    }

    window.addEventListener(cookieConsentReadyEvent, handleConsent);
    window.addEventListener(cookieConsentChangedEvent, handleConsent);

    return () => {
      window.removeEventListener(cookieConsentReadyEvent, handleConsent);
      window.removeEventListener(cookieConsentChangedEvent, handleConsent);
    };
  }, [pathname]);

  useEffect(() => {
    if (pathname.startsWith("/admin")) return;
    trackAdvertisingPageView(pathname);
  }, [pathname]);

  useEffect(() => {
    if (pathname !== "/book") return;

    const search = new URLSearchParams(window.location.search);
    const bookingReference = search.get("booking") ?? "";

    if (
      search.get("payment") !== "return" ||
      !/^[A-Z0-9-]{6,32}$/.test(bookingReference)
    ) return;

    let elapsedMs = 0;
    let active = true;
    let verificationInFlight = false;

    async function verifyPurchase() {
      if (verificationInFlight) return;

      verificationInFlight = true;
      try {
        await trackVerifiedAdvertisingPurchase({
          bookingReference,
          journeyId: getBookingJourneyId(),
        });
      } finally {
        verificationInFlight = false;
      }

      if (!canRetryAdvertisingPurchaseVerification()) {
        active = false;
      }
    }

    void verifyPurchase();
    const intervalId = window.setInterval(() => {
      elapsedMs += 2000;

      if (!active || elapsedMs >= 30000) {
        window.clearInterval(intervalId);
        return;
      }

      void verifyPurchase();
    }, 2000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [pathname]);

  return null;
}
