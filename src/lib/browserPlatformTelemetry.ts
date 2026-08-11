import { getAdminAuthSession } from "@/lib/supabase/auth";

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
const journeyKey = "zingara-booking-journey-id";
const heartbeatMs = 60_000;
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

export function getPlatformSessionId() {
  if (typeof window === "undefined") {
    return randomId("session");
  }

  const existing = storageGet(publicSessionKey);

  if (existing) {
    return existing;
  }

  const next = randomId("session");
  storageSet(publicSessionKey, next);
  return next;
}

export function getBookingJourneyId() {
  if (typeof window === "undefined") {
    return randomId("journey");
  }

  const existing = storageGet(journeyKey);

  if (existing) {
    return existing;
  }

  const next = randomId("journey");
  storageSet(journeyKey, next);
  return next;
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
  const journeyId = input.journeyId ?? getBookingJourneyId();

  void postTelemetry({
    bookingReference: input.bookingReference,
    durationMs: input.durationMs,
    eventType: input.eventType,
    journeyId,
    metadata: safeMetadata(input.metadata),
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

  if (signature === lastPresenceSignature && now - lastPresenceAt < heartbeatMs) {
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
