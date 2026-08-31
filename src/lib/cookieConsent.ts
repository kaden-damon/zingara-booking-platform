export const cookieConsentStorageKey = "zingara-cookie-consent";
export const cookieConsentChangedEvent = "zingara:cookie-consent-changed";

export type CookieConsent = {
  analytics: boolean;
  essential: true;
  marketing: boolean;
  recordedAt: string;
  version: number;
};

export type OptionalConsentCategory = "analytics" | "marketing";

export function createConsent(
  version: number,
  choices: { analytics: boolean; marketing: boolean },
  recordedAt = new Date().toISOString(),
): CookieConsent {
  return {
    analytics: choices.analytics === true,
    essential: true,
    marketing: choices.marketing === true,
    recordedAt,
    version,
  };
}

export function parseStoredConsent(value: string | null) {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Partial<CookieConsent>;

    if (
      parsed.essential !== true ||
      typeof parsed.analytics !== "boolean" ||
      typeof parsed.marketing !== "boolean" ||
      !Number.isInteger(parsed.version) ||
      Number(parsed.version) < 1 ||
      typeof parsed.recordedAt !== "string" ||
      Number.isNaN(Date.parse(parsed.recordedAt))
    ) {
      return null;
    }

    return parsed as CookieConsent;
  } catch {
    return null;
  }
}

export function isConsentCurrent(
  consent: CookieConsent | null,
  consentVersion: number,
) {
  return consent?.version === consentVersion;
}

export function getConsent(consentVersion?: number) {
  if (typeof window === "undefined") {
    return null;
  }

  const consent = parseStoredConsent(
    window.localStorage.getItem(cookieConsentStorageKey),
  );

  return consentVersion && !isConsentCurrent(consent, consentVersion)
    ? null
    : consent;
}

export function updateConsent(consent: CookieConsent) {
  if (typeof window === "undefined") {
    return consent;
  }

  window.localStorage.setItem(cookieConsentStorageKey, JSON.stringify(consent));
  window.dispatchEvent(
    new CustomEvent(cookieConsentChangedEvent, { detail: consent }),
  );

  return consent;
}

export function hasAnalyticsConsent(consentVersion?: number) {
  return getConsent(consentVersion)?.analytics === true;
}

export function hasMarketingConsent(consentVersion?: number) {
  return getConsent(consentVersion)?.marketing === true;
}

export function canInitializeConsentCategory(
  category: OptionalConsentCategory,
  consent: CookieConsent | null,
  consentVersion: number,
) {
  if (!isConsentCurrent(consent, consentVersion)) {
    return false;
  }

  return category === "analytics"
    ? consent?.analytics === true
    : consent?.marketing === true;
}
