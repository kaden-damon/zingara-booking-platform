import { getAdminAuthSession } from "@/lib/supabase/auth";
import { platformPresenceHeartbeatMs } from "@/lib/platformPresence";
import { hasAnalyticsConsent } from "@/lib/cookieConsent";

type TelemetryMetadata = Record<string, boolean | number | string | null>;

type TelemetryBase = {
  bookingReference?: string | null;
  journeyId?: string | null;
  metadata?: TelemetryMetadata;
  sessionId?: string;
  sessionType?: "public" | "staff";
};

type TrackEventInput = TelemetryBase & {
  durationMs?: number | null;
  eventType:
    | "checkout_viewed"
    | "guest_details_completed"
    | "journey_failed"
    | "journey_started"
    | "location_selected"
    | "payfast_returned"
    | "payment_initiated"
    | "seating_selected"
    | "session_started"
    | "site_view"
    | "show_selected";
  operation?: string | null;
  route?: string | null;
  safeFingerprint?: string | null;
  statusCode?: number | null;
};

type TrackSessionInput = TelemetryBase & {
  currentArea: string;
  currentStage: string;
};

const publicSessionKey = "zingara-platform-session-id";
const staffSessionKey = "zingara-staff-platform-session-id";
const visitorKey = "zingara-platform-visitor-id";
const journeyKey = "zingara-booking-journey-id-v2";
const publicSessionTimeoutMs = 30 * 60 * 1000;
let lastPresenceSignature = "";
let lastPresenceAt = 0;

function randomId(prefix: string) {
  const cryptoObject = globalThis.crypto;
  const bytes = new Uint8Array(16);

  if (cryptoObject?.getRandomValues) {
    cryptoObject.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  return `${prefix}_${Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
}

function storageGet(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Telemetry is best-effort only.
  }
}

function sessionStorageGet(key: string) {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function sessionStorageSet(key: string, value: string) {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Telemetry is best-effort only.
  }
}

type PublicSessionRecord = {
  id: string;
  lastSeenAt: number;
  startedEventRecorded: boolean;
};

function getPublicSessionRecord() {
  const now = Date.now();
  const stored = storageGet(publicSessionKey);

  if (stored) {
    try {
      const parsed = JSON.parse(stored) as Partial<PublicSessionRecord>;
      if (
        typeof parsed.id === "string" &&
        typeof parsed.lastSeenAt === "number" &&
        now - parsed.lastSeenAt < publicSessionTimeoutMs
      ) {
        const record = {
          id: parsed.id,
          lastSeenAt: now,
          startedEventRecorded: parsed.startedEventRecorded === true,
        };
        storageSet(publicSessionKey, JSON.stringify(record));
        return record;
      }
    } catch {
      // Legacy identifiers are rotated into a measurable 30-minute session.
    }
  }

  const record = {
    id: randomId("session"),
    lastSeenAt: now,
    startedEventRecorded: false,
  };
  storageSet(publicSessionKey, JSON.stringify(record));
  return record;
}

export function getPlatformSessionId() {
  if (typeof window === "undefined") {
    return randomId("session");
  }

  return getPublicSessionRecord().id;
}

export function getPlatformVisitorId() {
  if (typeof window === "undefined") {
    return randomId("visitor");
  }

  const existing = storageGet(visitorKey);
  if (existing && /^visitor_[a-zA-Z0-9_-]{24,80}$/.test(existing)) {
    return existing;
  }

  const next = randomId("visitor");
  storageSet(visitorKey, next);
  return next;
}

export function getStaffPlatformSessionId() {
  if (typeof window === "undefined") {
    return randomId("staff_session");
  }

  const existing = storageGet(staffSessionKey);

  if (existing) {
    return existing;
  }

  const next = randomId("staff_session");
  storageSet(staffSessionKey, next);
  return next;
}

export function getBookingJourneyId() {
  if (typeof window === "undefined") {
    return randomId("journey");
  }

  const sessionId = getPlatformSessionId();
  const existing = sessionStorageGet(journeyKey);

  if (existing) {
    try {
      const parsed = JSON.parse(existing) as { id?: unknown; sessionId?: unknown };
      if (
        typeof parsed.id === "string" &&
        parsed.id.startsWith("journey_") &&
        parsed.sessionId === sessionId
      ) {
        return parsed.id;
      }
    } catch {
      // Rotate malformed or legacy journey storage.
    }
  }

  const next = randomId("journey");
  sessionStorageSet(journeyKey, JSON.stringify({ id: next, sessionId }));
  return next;
}

function getTrafficSource() {
  if (typeof document === "undefined" || !document.referrer) return "direct";

  try {
    const hostname = new URL(document.referrer).hostname.toLowerCase();
    if (hostname === window.location.hostname) return "zingara";
    if (hostname.includes("google.")) return "google";
    if (hostname.includes("facebook.") || hostname === "fb.com") return "facebook";
    if (hostname.includes("instagram.")) return "instagram";
    if (hostname.includes("tiktok.")) return "tiktok";
    if (hostname.includes("bing.")) return "bing";
    return "other-referral";
  } catch {
    return "unknown";
  }
}

function getKnownLocation() {
  if (typeof window === "undefined") return null;
  const queryLocation = new URLSearchParams(window.location.search).get("location");
  const storedLocation = storageGet("zingara-selected-location");
  return [queryLocation, storedLocation].find((value) =>
    value === "cape-town" || value === "johannesburg",
  ) ?? null;
}

export function trackPublicSiteView(route: string) {
  if (typeof window === "undefined") return;

  const record = getPublicSessionRecord();
  const metadata = {
    location: getKnownLocation(),
    source: "public-website",
    trafficSource: getTrafficSource(),
    visitorId: getPlatformVisitorId(),
  };

  if (!record.startedEventRecorded) {
    storageSet(publicSessionKey, JSON.stringify({
      ...record,
      startedEventRecorded: true,
    }));
    trackPlatformEvent({
      eventType: "session_started",
      journeyId: null,
      metadata,
      route,
      sessionId: record.id,
    });
  }

  trackPlatformEvent({
    eventType: "site_view",
    journeyId: null,
    metadata,
    route,
    sessionId: record.id,
  });
}

function safeMetadata(metadata: TelemetryMetadata | undefined) {
  if (!metadata) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(metadata)
      .filter(([, value]) =>
        value === null ||
        ["boolean", "number", "string"].includes(typeof value),
      )
      .slice(0, 8),
  );
}

function getCurrentRoute() {
  return typeof window === "undefined" ? null : window.location.pathname;
}

async function postTelemetry(body: Record<string, unknown>, authenticated = false) {
  try {
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };

    if (authenticated) {
      const session = await getAdminAuthSession();
      const accessToken = session?.session.access_token;

      if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`;
      }
    }

    await fetch("/api/platform-telemetry", {
      body: JSON.stringify(body),
      headers,
      method: "POST",
      keepalive: JSON.stringify(body).length < 3500,
    });
  } catch {
    // Telemetry must never interrupt the product experience.
  }
}

export function trackPlatformEvent(input: TrackEventInput) {
  const sessionId = input.sessionId ?? getPlatformSessionId();
  const journeyId = input.journeyId === undefined
    ? getBookingJourneyId()
    : input.journeyId;
  const metadata = input.sessionType !== "staff" && hasAnalyticsConsent()
    ? { ...input.metadata, visitorId: getPlatformVisitorId() }
    : input.metadata;

  void postTelemetry({
    bookingReference: input.bookingReference,
    durationMs: input.durationMs,
    eventType: input.eventType,
    journeyId,
    metadata: safeMetadata(metadata),
    operation: input.operation,
    route: input.route ?? getCurrentRoute(),
    safeFingerprint: input.safeFingerprint,
    sessionId,
    sessionType: input.sessionType ?? "public",
    statusCode: input.statusCode,
    type: "event",
  }, input.sessionType === "staff");
}

export function upsertPlatformPresence(input: TrackSessionInput) {
  const sessionId = input.sessionId ?? getPlatformSessionId();
  const journeyId = input.journeyId ?? getBookingJourneyId();
  const signature = [
    input.sessionType ?? "public",
    sessionId,
    journeyId,
    input.currentArea,
    input.currentStage,
  ].join("|");
  const now = Date.now();

  if (
    signature === lastPresenceSignature &&
    now - lastPresenceAt < platformPresenceHeartbeatMs
  ) {
    return;
  }

  lastPresenceSignature = signature;
  lastPresenceAt = now;

  void postTelemetry({
    currentArea: input.currentArea,
    currentStage: input.currentStage,
    journeyId,
    metadata: safeMetadata(input.metadata),
    sessionId,
    sessionType: input.sessionType ?? "public",
    type: "session",
  }, input.sessionType === "staff");
}
