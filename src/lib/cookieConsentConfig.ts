export type CookieConsentConfig = {
  acceptAllLabel: string;
  analyticsDescription: string;
  bannerDescription: string;
  bannerHeading: string;
  consentVersion: number;
  enabled: boolean;
  essentialDescription: string;
  essentialOnlyLabel: string;
  footerLinkLabel: string;
  managePreferencesLabel: string;
  marketingDescription: string;
  preferencesHeading: string;
  savePreferencesLabel: string;
};

export const defaultCookieConsentConfig: CookieConsentConfig = {
  acceptAllLabel: "ACCEPT ALL",
  analyticsDescription:
    "Allows optional analytics technologies that help us understand and improve the booking experience.",
  bannerDescription:
    "Zingara uses essential technologies to operate the booking platform. With your permission, we may also use analytics technologies to understand how visitors use the platform and improve the experience.",
  bannerHeading: "WE VALUE YOUR PRIVACY",
  consentVersion: 1,
  enabled: true,
  essentialDescription:
    "Required for security, core preferences, booking, payment and ticket functionality.",
  essentialOnlyLabel: "ESSENTIAL ONLY",
  footerLinkLabel: "COOKIE PREFERENCES",
  managePreferencesLabel: "MANAGE PREFERENCES",
  marketingDescription:
    "Allows optional marketing technologies where Zingara introduces them and you choose to consent.",
  preferencesHeading: "COOKIE PREFERENCES",
  savePreferencesLabel: "SAVE PREFERENCES",
};

export const cookieConsentTextLimits = {
  description: 500,
  heading: 80,
  label: 40,
} as const;

const textFields = [
  "acceptAllLabel",
  "analyticsDescription",
  "bannerDescription",
  "bannerHeading",
  "essentialDescription",
  "essentialOnlyLabel",
  "footerLinkLabel",
  "managePreferencesLabel",
  "marketingDescription",
  "preferencesHeading",
  "savePreferencesLabel",
] as const;

export type CookieConsentTextField = (typeof textFields)[number];

function normalizeText(
  value: unknown,
  fallback: string,
  limit: number,
) {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return normalized ? normalized.slice(0, limit) : fallback;
}

function getTextLimit(field: CookieConsentTextField) {
  if (field.endsWith("Description")) {
    return cookieConsentTextLimits.description;
  }

  if (field.endsWith("Heading")) {
    return cookieConsentTextLimits.heading;
  }

  return cookieConsentTextLimits.label;
}

export function normalizeCookieConsentConfig(
  value: unknown,
): CookieConsentConfig {
  const source =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const normalized = { ...defaultCookieConsentConfig };

  for (const field of textFields) {
    normalized[field] = normalizeText(
      source[field],
      defaultCookieConsentConfig[field],
      getTextLimit(field),
    );
  }

  normalized.enabled =
    typeof source.enabled === "boolean"
      ? source.enabled
      : defaultCookieConsentConfig.enabled;
  normalized.consentVersion =
    Number.isInteger(source.consentVersion) && Number(source.consentVersion) > 0
      ? Number(source.consentVersion)
      : defaultCookieConsentConfig.consentVersion;

  return normalized;
}

export function validateCookieConsentConfig(
  value: unknown,
): string | null {
  if (!value || typeof value !== "object") {
    return "Cookie consent configuration is required.";
  }

  const source = value as Record<string, unknown>;

  for (const field of textFields) {
    const raw = source[field];
    const limit = getTextLimit(field);

    if (typeof raw !== "string" || !raw.trim()) {
      return `${field} is required.`;
    }

    if (raw.trim().length > limit) {
      return `${field} must be ${limit} characters or fewer.`;
    }

    if (/[\u0000-\u001f\u007f]/.test(raw)) {
      return `${field} contains unsupported characters.`;
    }
  }

  if (typeof source.enabled !== "boolean") {
    return "Cookie consent enabled state is required.";
  }

  if (
    !Number.isInteger(source.consentVersion) ||
    Number(source.consentVersion) < 1
  ) {
    return "Consent version must be a positive whole number.";
  }

  return null;
}

export function getChangedCookieConsentFields(
  previous: CookieConsentConfig,
  next: CookieConsentConfig,
) {
  return (Object.keys(next) as Array<keyof CookieConsentConfig>).filter(
    (field) => previous[field] !== next[field],
  );
}
