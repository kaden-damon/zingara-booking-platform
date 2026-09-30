"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { trackPublicSiteView } from "@/lib/browserPlatformTelemetry";
import {
  cookieConsentChangedEvent,
  cookieConsentReadyEvent,
  type CookieConsent,
} from "@/lib/cookieConsent";

const trackedPublicRoutes = new Set([
  "/",
  "/book",
  "/find-booking",
  "/royal-decrees",
]);

export default function PublicTrafficTelemetry() {
  const pathname = usePathname();
  const analyticsAllowedRef = useRef(false);
  const trackedPathRef = useRef("");

  useEffect(() => {
    const isPublicRoute = trackedPublicRoutes.has(pathname)
      || pathname.startsWith("/royal-decrees/");
    if (!isPublicRoute) return;

    function recordWhenAllowed(analytics: boolean) {
      analyticsAllowedRef.current = analytics;
      if (!analytics || trackedPathRef.current === pathname) return;
      trackedPathRef.current = pathname;
      trackPublicSiteView(pathname);
    }

    function handleReady(event: Event) {
      const detail = (event as CustomEvent<{ analytics?: unknown }>).detail;
      recordWhenAllowed(detail?.analytics === true);
    }

    function handleChange(event: Event) {
      const detail = (event as CustomEvent<CookieConsent>).detail;
      recordWhenAllowed(detail?.analytics === true);
    }

    window.addEventListener(cookieConsentReadyEvent, handleReady);
    window.addEventListener(cookieConsentChangedEvent, handleChange);
    recordWhenAllowed(analyticsAllowedRef.current);
    return () => {
      window.removeEventListener(cookieConsentReadyEvent, handleReady);
      window.removeEventListener(cookieConsentChangedEvent, handleChange);
    };
  }, [pathname]);

  return null;
}
