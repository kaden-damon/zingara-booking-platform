import type { CookieConsent } from "@/lib/cookieConsent";
import type { AdvertisingPurchasePayload } from "@/lib/advertisingPurchase";

export const ga4MeasurementId = "G-PP7C1SBY8N";
export const googleAdsId = "AW-18530431025";
export const googleAdsPurchaseDestination =
  "AW-18530431025/mApNCLCkxaUdELHg_4NF";
export const metaPixelId = "1434578967806435";

type AdvertisingMetadata = Record<string, boolean | number | string | null>;
type GoogleTag = (...args: unknown[]) => void;
type MetaPixel = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  loaded?: boolean;
  push?: (...args: unknown[]) => void;
  queue?: unknown[][];
  version?: string;
};

declare global {
  interface Window {
    __zingaraGoogleAdsConfigured?: boolean;
    __zingaraGoogleAnalyticsConfigured?: boolean;
    __zingaraGoogleConsentDefaulted?: boolean;
    __zingaraGoogleInitialized?: boolean;
    __zingaraMetaInitialized?: boolean;
    _fbq?: MetaPixel;
    dataLayer?: unknown[];
    fbq?: MetaPixel;
    gtag?: GoogleTag;
  }
}

const googleScriptId = "zingara-google-tag";
const metaScriptId = "zingara-meta-pixel";
const purchaseStoragePrefix = "zingara-ad-purchase-v1:";
let currentConsent: Pick<CookieConsent, "analytics" | "marketing"> = {
  analytics: false,
  marketing: false,
};
let purchaseDispatchAvailable: boolean | null = null;
let googlePageViewPath = "";
let metaPageViewPath = "";

function isProductionTrackingHost() {
  return typeof window !== "undefined" &&
    window.location.hostname === "book.zingara.co.za";
}

function ensureGoogleCommandQueue() {
  window.dataLayer = window.dataLayer ?? [];
  window.gtag = window.gtag ?? function gtag() {
    // Google requires an Arguments object here; arrays are ignored by gtag.js.
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer?.push(arguments);
  };
  return window.gtag;
}

function ensureGoogleScript() {
  if (document.getElementById(googleScriptId)) return;

  const script = document.createElement("script");
  script.async = true;
  script.id = googleScriptId;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${ga4MeasurementId}`;
  document.head.appendChild(script);
}

function ensureMetaPixel() {
  if (!window.fbq) {
    const pixel: MetaPixel = function metaPixel(...args: unknown[]) {
      if (pixel.callMethod) {
        pixel.callMethod(...args);
      } else {
        pixel.queue?.push(args);
      }
    };
    pixel.loaded = true;
    pixel.queue = [];
    pixel.version = "2.0";
    window.fbq = pixel;
    window._fbq = pixel;
  }

  if (!document.getElementById(metaScriptId)) {
    const script = document.createElement("script");
    script.async = true;
    script.id = metaScriptId;
    script.src = "https://connect.facebook.net/en_US/fbevents.js";
    document.head.appendChild(script);
  }

  if (!window.__zingaraMetaInitialized) {
    window.fbq?.("init", metaPixelId);
    window.__zingaraMetaInitialized = true;
  }
}

export function applyAdvertisingConsent(consent: Pick<CookieConsent, "analytics" | "marketing">) {
  if (typeof window === "undefined" || !isProductionTrackingHost()) return;

  currentConsent = consent;

  const gtag = ensureGoogleCommandQueue();
  const analyticsState = consent.analytics ? "granted" : "denied";
  const marketingState = consent.marketing ? "granted" : "denied";

  if (!window.__zingaraGoogleConsentDefaulted) {
    gtag("consent", "default", {
      ad_personalization: "denied",
      ad_storage: "denied",
      ad_user_data: "denied",
      analytics_storage: "denied",
      wait_for_update: 500,
    });
    window.__zingaraGoogleConsentDefaulted = true;
  }

  gtag("consent", "update", {
    ad_personalization: marketingState,
    ad_storage: marketingState,
    ad_user_data: marketingState,
    analytics_storage: analyticsState,
  });

  if (consent.analytics || consent.marketing) {
    ensureGoogleScript();

    if (!window.__zingaraGoogleInitialized) {
      gtag("set", "linker", {
        accept_incoming: true,
        domains: ["zingara.co.za", "book.zingara.co.za"],
      });
      gtag("js", new Date());
      window.__zingaraGoogleInitialized = true;
    }
  }

  if (consent.analytics && !window.__zingaraGoogleAnalyticsConfigured) {
    gtag("config", ga4MeasurementId, {
      allow_ad_personalization_signals: false,
      send_page_view: false,
    });
    window.__zingaraGoogleAnalyticsConfigured = true;
  }

  if (consent.marketing && !window.__zingaraGoogleAdsConfigured) {
    gtag("config", googleAdsId, {
      allow_ad_personalization_signals: true,
    });
    window.__zingaraGoogleAdsConfigured = true;
  }

  if (consent.marketing) {
    ensureMetaPixel();
    window.fbq?.("consent", "grant");
  } else if (window.__zingaraMetaInitialized) {
    window.fbq?.("consent", "revoke");
  }

  trackAdvertisingPageView(window.location.pathname);
}

export function trackAdvertisingPageView(route: string | null) {
  if (typeof window === "undefined" || !isProductionTrackingHost()) return;

  const pagePath = route ?? window.location.pathname;

  if (currentConsent.analytics && window.gtag && googlePageViewPath !== pagePath) {
    window.gtag("event", "page_view", {
      page_path: pagePath,
      send_to: ga4MeasurementId,
    });
    googlePageViewPath = pagePath;
  }

  if (currentConsent.marketing && window.fbq && metaPageViewPath !== pagePath) {
    window.fbq("track", "PageView");
    metaPageViewPath = pagePath;
  }
}

function safeString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, 80)
    : fallback;
}

export function trackAdvertisingJourneyEvent(
  eventType: string,
  metadata: AdvertisingMetadata | undefined,
  route: string | null,
) {
  if (typeof window === "undefined" || !isProductionTrackingHost()) return;

  const consent = currentConsent;

  if (!consent.analytics && !consent.marketing) return;

  if (consent.analytics && window.gtag) {
    const location = safeString(metadata?.location, "all-venues");
    const section = safeString(metadata?.section, "seating");

    switch (eventType) {
      case "site_view":
        trackAdvertisingPageView(route);
        break;
      case "location_selected":
        window.gtag("event", "view_item_list", {
          item_list_name: location,
          send_to: ga4MeasurementId,
        });
        break;
      case "show_selected":
        window.gtag("event", "view_item", {
          items: [{ item_id: "performance", item_name: "Zingara performance" }],
          send_to: ga4MeasurementId,
        });
        break;
      case "seating_selected":
        window.gtag("event", "select_item", {
          item_list_name: "seating",
          items: [{ item_id: section, item_name: section }],
          send_to: ga4MeasurementId,
        });
        break;
      case "checkout_initiated":
        window.gtag("event", "begin_checkout", { send_to: ga4MeasurementId });
        break;
      case "payment_initiated":
        window.gtag("event", "add_payment_info", {
          payment_type: "PayFast",
          send_to: ga4MeasurementId,
        });
        break;
    }
  }

  if (consent.marketing && window.fbq) {
    switch (eventType) {
      case "site_view":
        trackAdvertisingPageView(route);
        break;
      case "show_selected":
        window.fbq("track", "ViewContent", { content_name: "Zingara performance" });
        break;
      case "checkout_initiated":
        window.fbq("track", "InitiateCheckout", { currency: "ZAR" });
        break;
      case "payment_initiated":
        window.fbq("track", "AddPaymentInfo", { currency: "ZAR" });
        break;
    }
  }
}

type RecordedPurchaseDestinations = {
  googleAds?: boolean;
  googleAnalytics?: boolean;
  meta?: boolean;
};

function getRecordedPurchaseDestinations(transactionId: string) {
  try {
    return JSON.parse(
      window.localStorage.getItem(`${purchaseStoragePrefix}${transactionId}`) ?? "{}",
    ) as RecordedPurchaseDestinations;
  } catch {
    return {};
  }
}

function saveRecordedPurchaseDestinations(
  transactionId: string,
  destinations: RecordedPurchaseDestinations,
) {
  try {
    window.localStorage.setItem(
      `${purchaseStoragePrefix}${transactionId}`,
      JSON.stringify(destinations),
    );
  } catch {
    // Provider transaction IDs remain the authoritative duplicate guard.
  }
}

export function dispatchAdvertisingPurchase(payload: AdvertisingPurchasePayload) {
  if (typeof window === "undefined" || !isProductionTrackingHost()) return false;

  const consent = currentConsent;

  if (!consent.analytics && !consent.marketing) return false;

  const recorded = getRecordedPurchaseDestinations(payload.transactionId);
  let dispatched = false;

  if (consent.analytics && window.gtag && !recorded.googleAnalytics) {
    window.gtag("event", "purchase", {
      currency: payload.currency,
      items: [{
        item_id: "zingara-booking",
        item_name: "Zingara booking",
        quantity: payload.guestCount,
      }],
      send_to: ga4MeasurementId,
      transaction_id: payload.transactionId,
      value: payload.value,
    });
    recorded.googleAnalytics = true;
    dispatched = true;
  }

  if (consent.marketing && window.gtag && !recorded.googleAds) {
    window.gtag("event", "conversion", {
      currency: payload.currency,
      send_to: googleAdsPurchaseDestination,
      transaction_id: payload.transactionId,
      value: payload.value,
    });
    recorded.googleAds = true;
    dispatched = true;
  }

  if (consent.marketing && window.fbq && !recorded.meta) {
    window.fbq(
      "track",
      "Purchase",
      { currency: payload.currency, value: payload.value },
      { eventID: payload.eventId },
    );
    recorded.meta = true;
    dispatched = true;
  }

  if (dispatched) {
    saveRecordedPurchaseDestinations(payload.transactionId, recorded);
  }

  return dispatched;
}

export async function trackVerifiedAdvertisingPurchase(input: {
  bookingReference: string;
  journeyId: string;
}) {
  if (
    typeof window === "undefined" ||
    !isProductionTrackingHost() ||
    (!currentConsent.analytics && !currentConsent.marketing) ||
    purchaseDispatchAvailable === false
  ) return false;

  try {
    const response = await fetch("/api/advertising/purchase", {
      body: JSON.stringify(input),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const body = (await response.json()) as {
      conversion?: AdvertisingPurchasePayload;
      dispatchAuthorized?: boolean;
      eligible?: boolean;
    };

    if (body.dispatchAuthorized === false) {
      purchaseDispatchAvailable = false;
      return false;
    }

    purchaseDispatchAvailable = body.dispatchAuthorized === true;

    if (
      !response.ok ||
      body.dispatchAuthorized !== true ||
      body.eligible !== true ||
      !body.conversion
    ) {
      return false;
    }

    return dispatchAdvertisingPurchase(body.conversion);
  } catch {
    return false;
  }
}

export function canRetryAdvertisingPurchaseVerification() {
  return purchaseDispatchAvailable !== false;
}
