import { getConsent } from "./cookieConsent.ts";
import type { SupabaseClient } from "@supabase/supabase-js";

export type AdvertisingAttributionInput = {
  analyticsConsent: boolean;
  consentRecordedAt: string;
  consentVersion: number;
  fbc?: string;
  fbclid?: string;
  fbp?: string;
  gaClientId?: string;
  gbraid?: string;
  gclid?: string;
  marketingConsent: boolean;
  utmCampaign?: string;
  utmContent?: string;
  utmMedium?: string;
  utmSource?: string;
  utmTerm?: string;
  wbraid?: string;
};

const attributionStorageKey = "zingara-ad-attribution-v1";
const queryFields = {
  fbclid: "fbclid",
  gbraid: "gbraid",
  gclid: "gclid",
  utmCampaign: "utm_campaign",
  utmContent: "utm_content",
  utmMedium: "utm_medium",
  utmSource: "utm_source",
  utmTerm: "utm_term",
  wbraid: "wbraid",
} as const;

function bounded(value: unknown, maxLength = 255) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : undefined;
}

function readCookie(name: string) {
  if (typeof document === "undefined") return undefined;
  const prefix = `${name}=`;
  const match = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  return match ? decodeURIComponent(match.slice(prefix.length)) : undefined;
}

function readGaClientId() {
  const value = readCookie("_ga");
  if (!value) return undefined;
  const parts = value.split(".");
  return parts.length >= 4 ? bounded(parts.slice(-2).join("."), 100) : undefined;
}

function loadStoredAttribution() {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(
      window.sessionStorage.getItem(attributionStorageKey) ?? "{}",
    ) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed)
        .map(([key, value]) => [key, bounded(value)] as const)
        .filter((entry): entry is [string, string] => Boolean(entry[1])),
    );
  } catch {
    return {};
  }
}

function captureCurrentQueryAttribution() {
  const stored = loadStoredAttribution();
  if (typeof window === "undefined") return stored;
  const search = new URLSearchParams(window.location.search);
  const next: Record<string, string> = { ...stored };

  for (const [field, parameter] of Object.entries(queryFields)) {
    const value = bounded(search.get(parameter), field.startsWith("utm") ? 160 : 255);
    if (value) next[field] = value;
  }

  try {
    window.sessionStorage.setItem(attributionStorageKey, JSON.stringify(next));
  } catch {
    // Attribution is best-effort and must never interrupt booking.
  }

  return next;
}

export function getAdvertisingAttributionSnapshot(): AdvertisingAttributionInput | null {
  if (typeof window === "undefined") return null;
  const consent = getConsent();
  if (!consent || (!consent.analytics && !consent.marketing)) return null;

  const captured = captureCurrentQueryAttribution();
  return {
    analyticsConsent: consent.analytics,
    consentRecordedAt: consent.recordedAt,
    consentVersion: consent.version,
    fbc: consent.marketing ? bounded(readCookie("_fbc"), 255) : undefined,
    fbclid: consent.marketing ? bounded(captured.fbclid, 255) : undefined,
    fbp: consent.marketing ? bounded(readCookie("_fbp"), 255) : undefined,
    gaClientId: consent.analytics ? readGaClientId() : undefined,
    gbraid: consent.marketing ? bounded(captured.gbraid, 255) : undefined,
    gclid: consent.marketing ? bounded(captured.gclid, 255) : undefined,
    marketingConsent: consent.marketing,
    utmCampaign: bounded(captured.utmCampaign, 160),
    utmContent: bounded(captured.utmContent, 160),
    utmMedium: bounded(captured.utmMedium, 160),
    utmSource: bounded(captured.utmSource, 160),
    utmTerm: bounded(captured.utmTerm, 160),
    wbraid: consent.marketing ? bounded(captured.wbraid, 255) : undefined,
  };
}

function safeAttributionValue(value: unknown, maxLength: number) {
  const normalized = bounded(value, maxLength);
  return normalized && /^[\w .:/+-]+$/u.test(normalized) ? normalized : null;
}

export function normalizeAdvertisingAttribution(
  value: unknown,
): AdvertisingAttributionInput | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Partial<AdvertisingAttributionInput>;
  const consentRecordedAt = bounded(source.consentRecordedAt, 40);
  const consentVersion = Number(source.consentVersion);
  if (
    (!source.analyticsConsent && !source.marketingConsent) ||
    !consentRecordedAt ||
    Number.isNaN(Date.parse(consentRecordedAt)) ||
    !Number.isInteger(consentVersion) ||
    consentVersion < 1
  ) return null;

  return {
    analyticsConsent: source.analyticsConsent === true,
    consentRecordedAt,
    consentVersion,
    fbc: source.marketingConsent ? safeAttributionValue(source.fbc, 255) ?? undefined : undefined,
    fbclid: source.marketingConsent ? safeAttributionValue(source.fbclid, 255) ?? undefined : undefined,
    fbp: source.marketingConsent ? safeAttributionValue(source.fbp, 255) ?? undefined : undefined,
    gaClientId: source.analyticsConsent ? safeAttributionValue(source.gaClientId, 100) ?? undefined : undefined,
    gbraid: source.marketingConsent ? safeAttributionValue(source.gbraid, 255) ?? undefined : undefined,
    gclid: source.marketingConsent ? safeAttributionValue(source.gclid, 255) ?? undefined : undefined,
    marketingConsent: source.marketingConsent === true,
    utmCampaign: safeAttributionValue(source.utmCampaign, 160) ?? undefined,
    utmContent: safeAttributionValue(source.utmContent, 160) ?? undefined,
    utmMedium: safeAttributionValue(source.utmMedium, 160) ?? undefined,
    utmSource: safeAttributionValue(source.utmSource, 160) ?? undefined,
    utmTerm: safeAttributionValue(source.utmTerm, 160) ?? undefined,
    wbraid: source.marketingConsent ? safeAttributionValue(source.wbraid, 255) ?? undefined : undefined,
  };
}

export async function recordAdvertisingAttributionBestEffort(
  client: SupabaseClient,
  input: {
    attribution: unknown;
    bookingId: string;
    journeyId: string | null;
  },
) {
  if (process.env.ADVERTISING_ATTRIBUTION_CAPTURE_ENABLED !== "true") return false;
  const attribution = normalizeAdvertisingAttribution(input.attribution);
  if (!attribution || !input.journeyId) return false;
  if (!/^journey_[A-Za-z0-9_-]{12,80}$/.test(input.journeyId)) return false;

  const { error } = await client.from("advertising_attribution").upsert(
    {
      analytics_consent: attribution.analyticsConsent,
      booking_id: input.bookingId,
      consent_recorded_at: attribution.consentRecordedAt,
      consent_version: attribution.consentVersion,
      fbc: attribution.fbc ?? null,
      fbclid: attribution.fbclid ?? null,
      fbp: attribution.fbp ?? null,
      ga_client_id: attribution.gaClientId ?? null,
      gbraid: attribution.gbraid ?? null,
      gclid: attribution.gclid ?? null,
      journey_id: input.journeyId,
      marketing_consent: attribution.marketingConsent,
      updated_at: new Date().toISOString(),
      utm_campaign: attribution.utmCampaign ?? null,
      utm_content: attribution.utmContent ?? null,
      utm_medium: attribution.utmMedium ?? null,
      utm_source: attribution.utmSource ?? null,
      utm_term: attribution.utmTerm ?? null,
      wbraid: attribution.wbraid ?? null,
    },
    { onConflict: "booking_id" },
  );

  if (error) {
    console.error("[Zingara Advertising] Attribution could not be retained", {
      code: error.code,
    });
    return false;
  }

  return true;
}
