import {
  isSafeJourneyId,
  isSafeSessionId,
  publicPlatformEventTypes,
  recordPlatformEvent,
  sanitizeTelemetryMetadata,
  upsertPlatformSession,
  type PlatformEventType,
  type PlatformSessionType,
} from "@/lib/platformTelemetry";
import {
  getRequestingUser,
  getServiceClient,
} from "@/lib/supabase/serverAdmin";
import {
  checkRateLimit,
  rateLimitResponse,
} from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

const maxPayloadBytes = 4096;
const publicAreas = new Set(["Book", "Find My Booking", "Royal Decrees"]);
const publicStages = new Set([
  "Awaiting Payment Confirmation",
  "Booking Complete",
  "Booking Details",
  "Browsing Shows",
  "Checkout",
  "PayFast Return",
  "Redirecting to PayFast",
  "Selecting Date",
  "Selecting Location",
  "Selecting Party Size",
  "Selecting Seating",
]);
const staffAreas = new Set([
  "Bookings",
  "Check-In",
  "Customers",
  "Dashboard",
  "Operations",
  "Platform Operations",
  "Reports",
  "Settings",
]);

type TelemetryPayload = {
  bookingReference?: unknown;
  currentArea?: unknown;
  currentStage?: unknown;
  durationMs?: unknown;
  eventType?: unknown;
  journeyId?: unknown;
  metadata?: unknown;
  operation?: unknown;
  route?: unknown;
  safeFingerprint?: unknown;
  sessionId?: unknown;
  sessionType?: unknown;
  statusCode?: unknown;
  type?: unknown;
};

function text(value: unknown, maxLength = 160) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function number(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getAllowedArea(sessionType: PlatformSessionType, value: unknown) {
  const area = text(value, 80);

  if (sessionType === "staff") {
    return staffAreas.has(area) ? area : "Dashboard";
  }

  return publicAreas.has(area) ? area : "Book";
}

function getAllowedStage(sessionType: PlatformSessionType, value: unknown) {
  const stage = text(value, 80);

  if (sessionType === "staff") {
    return stage || "Active";
  }

  return publicStages.has(stage) ? stage : "Browsing Shows";
}

async function resolveStaffProfile(request: Request) {
  const serviceClient = getServiceClient();
  const user = await getRequestingUser(request);

  if (!serviceClient || !user?.id) {
    return null;
  }

  const { data, error } = await serviceClient
    .from("staff_profiles")
    .select("id,active,roles(name)")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !data?.active) {
    return null;
  }

  return data as {
    active: boolean;
    id: string;
    roles?: { name?: string | null } | Array<{ name?: string | null }> | null;
  };
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);

  if (contentLength > maxPayloadBytes) {
    return Response.json({ error: "Telemetry payload is too large." }, { status: 413 });
  }

  const serviceClient = getServiceClient();

  if (!serviceClient) {
    return Response.json({ ok: true, recorded: false });
  }

  const ipLimit = await checkRateLimit(
    request,
    {
      limit: 300,
      scope: "platform_telemetry_ip",
      windowSeconds: 60,
    },
    [],
    serviceClient,
  );

  if (!ipLimit.allowed) {
    return rateLimitResponse(
      ipLimit.retryAfterSeconds,
      {
        operation: "record_platform_telemetry",
        route: "/api/platform-telemetry",
        safeFingerprint: "platform_telemetry_rate_limited_ip",
      },
      serviceClient,
    );
  }

  const payload = (await request.json().catch(() => null)) as TelemetryPayload | null;

  if (!payload || typeof payload !== "object") {
    return Response.json({ error: "Invalid telemetry payload." }, { status: 400 });
  }

  const sessionType: PlatformSessionType =
    payload.sessionType === "staff" ? "staff" : "public";
  const sessionId = text(payload.sessionId, 100);
  const journeyId = text(payload.journeyId, 100);

  if (!isSafeSessionId(sessionId)) {
    return Response.json({ error: "Invalid telemetry session." }, { status: 400 });
  }

  const sessionLimit = await checkRateLimit(
    request,
    {
      limit: 180,
      scope: "platform_telemetry_session",
      windowSeconds: 60,
    },
    [sessionId],
    serviceClient,
  );

  if (!sessionLimit.allowed) {
    return rateLimitResponse(
      sessionLimit.retryAfterSeconds,
      {
        operation: "record_platform_telemetry",
        route: "/api/platform-telemetry",
        safeFingerprint: "platform_telemetry_rate_limited_session",
        sessionId,
      },
      serviceClient,
    );
  }

  if (journeyId && !isSafeJourneyId(journeyId)) {
    return Response.json({ error: "Invalid journey identifier." }, { status: 400 });
  }

  let staffProfileId: string | null = null;

  if (sessionType === "staff") {
    const staffProfile = await resolveStaffProfile(request);

    if (!staffProfile?.id) {
      return Response.json({ error: "Staff telemetry requires authentication." }, { status: 401 });
    }

    staffProfileId = staffProfile.id;
  }

  const writeType = text(payload.type, 24);

  if (writeType === "session") {
    const recorded = await upsertPlatformSession(
      {
        currentArea: getAllowedArea(sessionType, payload.currentArea),
        currentStage: getAllowedStage(sessionType, payload.currentStage),
        journeyId: journeyId || null,
        metadata: sanitizeTelemetryMetadata(payload.metadata),
        sessionId,
        sessionType,
        staffProfileId,
      },
      serviceClient,
    );

    return Response.json({ ok: true, recorded });
  }

  if (writeType === "event") {
    const eventType = text(payload.eventType, 80) as PlatformEventType;

    if (!publicPlatformEventTypes.has(eventType)) {
      return Response.json({ error: "Unsupported telemetry event." }, { status: 400 });
    }

    const recorded = await recordPlatformEvent(
      {
        bookingReference: text(payload.bookingReference, 80) || null,
        durationMs: number(payload.durationMs),
        eventType,
        journeyId: journeyId || null,
        metadata: sanitizeTelemetryMetadata(payload.metadata),
        operation: text(payload.operation, 80) || null,
        route: text(payload.route, 120) || null,
        safeFingerprint: text(payload.safeFingerprint, 120) || null,
        sessionId,
        severity: eventType === "journey_failed" ? "warning" : "info",
        statusCode: number(payload.statusCode),
      },
      serviceClient,
    );

    return Response.json({ ok: true, recorded });
  }

  return Response.json({ error: "Unsupported telemetry request." }, { status: 400 });
}
