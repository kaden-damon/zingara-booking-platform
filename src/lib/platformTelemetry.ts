import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/supabase/serverAdmin";

export type PlatformEventType =
  | "booking_completed"
  | "booking_reserved"
  | "checkout_viewed"
  | "guest_details_completed"
  | "journey_failed"
  | "journey_started"
  | "location_selected"
  | "payfast_returned"
  | "payment_confirmed"
  | "payment_initiated"
  | "rate_limited"
  | "seating_selected"
  | "show_selected";

export type PlatformEventSeverity = "error" | "info" | "warning";
export type PlatformSessionType = "public" | "staff";

type SafeMetadataValue = boolean | number | string | null;
type SafeMetadata = Record<string, SafeMetadataValue>;

export type PlatformSessionInput = {
  currentArea: string;
  currentStage: string;
  journeyId?: string | null;
  metadata?: SafeMetadata;
  sessionId: string;
  sessionType: PlatformSessionType;
  staffProfileId?: string | null;
};

export type PlatformEventInput = {
  bookingReference?: string | null;
  durationMs?: number | null;
  eventType: PlatformEventType;
  journeyId?: string | null;
  metadata?: SafeMetadata;
  operation?: string | null;
  route?: string | null;
  safeFingerprint?: string | null;
  sessionId?: string | null;
  severity?: PlatformEventSeverity;
  statusCode?: number | null;
};

export type PlatformErrorInput = Omit<PlatformEventInput, "eventType" | "severity"> & {
  safeFingerprint: string;
};

export const publicPlatformEventTypes = new Set<PlatformEventType>([
  "checkout_viewed",
  "guest_details_completed",
  "journey_failed",
  "journey_started",
  "location_selected",
  "payfast_returned",
  "payment_initiated",
  "seating_selected",
  "show_selected",
]);

export const serverPlatformEventTypes = new Set<PlatformEventType>([
  "booking_completed",
  "booking_reserved",
  "journey_failed",
  "payment_confirmed",
  "payment_initiated",
  "rate_limited",
]);

const sensitiveKeyPattern =
  /authorization|auth|card|cookie|credential|cvv|passphrase|password|payfast|secret|service[_-]?role|signature|site_password|smtp|supabase|token|vapid/i;
const allowedMetadataKeys = new Set([
  "location",
  "paymentState",
  "paymentStatus",
  "section",
  "source",
  "stage",
  "status",
  "step",
]);
const maxStringLength = 120;
const maxMetadataKeys = 8;

function trimText(value: string | null | undefined, maxLength = 160) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return null;
  }

  return trimmed.slice(0, maxLength);
}

function getDeploymentId() {
  return (
    process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ??
    process.env.VERCEL_DEPLOYMENT_ID ??
    null
  );
}

export function isSafeSessionId(value: unknown) {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{12,80}$/.test(value);
}

export function isSafeJourneyId(value: unknown) {
  return typeof value === "string" && /^journey_[a-zA-Z0-9_-]{12,80}$/.test(value);
}

export function sanitizeTelemetryMetadata(
  metadata: unknown,
  allowedKeys = allowedMetadataKeys,
): SafeMetadata {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }

  const sanitized: SafeMetadata = {};

  for (const [key, value] of Object.entries(metadata as Record<string, unknown>)) {
    if (Object.keys(sanitized).length >= maxMetadataKeys) {
      break;
    }

    if (!allowedKeys.has(key) || sensitiveKeyPattern.test(key)) {
      continue;
    }

    if (typeof value === "string") {
      sanitized[key] = value.slice(0, maxStringLength);
    } else if (typeof value === "number" && Number.isFinite(value)) {
      sanitized[key] = value;
    } else if (typeof value === "boolean" || value === null) {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

export async function upsertPlatformSession(
  input: PlatformSessionInput,
  client: SupabaseClient | null = getServiceClient(),
) {
  if (!client || !isSafeSessionId(input.sessionId)) {
    return false;
  }

  const now = new Date().toISOString();
  const { error } = await client.from("platform_sessions").upsert(
    {
      current_area: trimText(input.currentArea, 80) ?? "Unknown",
      current_stage: trimText(input.currentStage, 80) ?? "Active",
      journey_id: input.journeyId && isSafeJourneyId(input.journeyId)
        ? input.journeyId
        : null,
      last_seen_at: now,
      metadata: sanitizeTelemetryMetadata(input.metadata),
      session_id: input.sessionId,
      session_type: input.sessionType,
      staff_profile_id: input.sessionType === "staff"
        ? input.staffProfileId ?? null
        : null,
      updated_at: now,
    },
    { onConflict: "session_id" },
  );

  if (error) {
    console.error("[Zingara telemetry] Session upsert failed", {
      message: error.message,
      sessionType: input.sessionType,
    });
    return false;
  }

  return true;
}

export async function recordPlatformEvent(
  input: PlatformEventInput,
  client: SupabaseClient | null = getServiceClient(),
) {
  if (!client) {
    return false;
  }

  const { error } = await client.from("platform_events").insert({
    booking_reference: trimText(input.bookingReference, 80),
    deployment_id: getDeploymentId(),
    duration_ms:
      typeof input.durationMs === "number" && Number.isFinite(input.durationMs)
        ? Math.max(0, Math.round(input.durationMs))
        : null,
    event_type: input.eventType,
    journey_id: input.journeyId && isSafeJourneyId(input.journeyId)
      ? input.journeyId
      : null,
    metadata: sanitizeTelemetryMetadata(input.metadata),
    operation: trimText(input.operation, 80),
    route: trimText(input.route, 120),
    safe_fingerprint: trimText(input.safeFingerprint, 120),
    session_id: input.sessionId && isSafeSessionId(input.sessionId)
      ? input.sessionId
      : null,
    severity: input.severity ?? "info",
    status_code:
      typeof input.statusCode === "number" && Number.isInteger(input.statusCode)
        ? input.statusCode
        : null,
  });

  if (error) {
    console.error("[Zingara telemetry] Event insert failed", {
      eventType: input.eventType,
      message: error.message,
    });
    return false;
  }

  return true;
}

export async function recordPlatformErrorEvent(
  input: PlatformErrorInput,
  client: SupabaseClient | null = getServiceClient(),
) {
  return recordPlatformEvent(
    {
      ...input,
      eventType: "journey_failed",
      severity: "error",
    },
    client,
  );
}

export type PlatformIncidentInput = PlatformErrorInput & {
  service: string;
  summary: string;
  threshold?: number;
  windowMs?: number;
};

type PlatformIncidentRow = {
  affected_count: number;
  id: string;
  status: "incident" | "recovered" | "warning";
};

async function updateIncidentForFailure(
  input: PlatformIncidentInput,
  client: SupabaseClient,
) {
  const fingerprint = trimText(input.safeFingerprint, 120);
  const service = trimText(input.service, 80);
  const summary = trimText(input.summary, 240);

  if (!fingerprint || !service || !summary) {
    return false;
  }

  const threshold = input.threshold ?? 3;
  const since = new Date(
    Date.now() - (input.windowMs ?? 5 * 60 * 1000),
  ).toISOString();
  const { count, error: countError } = await client
    .from("platform_events")
    .select("id", { count: "exact", head: true })
    .eq("safe_fingerprint", fingerprint)
    .in("severity", ["warning", "error"])
    .gte("created_at", since);

  if (countError) {
    throw countError;
  }

  const failureCount = count ?? 0;

  if (failureCount < threshold) {
    return false;
  }

  const status = failureCount >= threshold * 2 ? "incident" : "warning";
  const { data: existing, error: existingError } = await client
    .from("platform_incidents")
    .select("id,status,affected_count")
    .eq("service", service)
    .eq("fingerprint", fingerprint)
    .in("status", ["warning", "incident"])
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingError) {
    throw existingError;
  }

  const existingIncident = existing as PlatformIncidentRow | null;
  const now = new Date().toISOString();

  if (existingIncident?.id) {
    const { error } = await client
      .from("platform_incidents")
      .update({
        affected_count: Math.max(existingIncident.affected_count + 1, failureCount),
        deployment_id: getDeploymentId(),
        metadata: sanitizeTelemetryMetadata({
          status: input.statusCode ?? null,
        }),
        status,
        summary,
        updated_at: now,
      })
      .eq("id", existingIncident.id);

    if (error) {
      throw error;
    }

    return true;
  }

  const { error } = await client.from("platform_incidents").insert({
    affected_count: failureCount,
    deployment_id: getDeploymentId(),
    fingerprint,
    metadata: sanitizeTelemetryMetadata({
      status: input.statusCode ?? null,
    }),
    service,
    status,
    summary,
    updated_at: now,
  });

  if (error) {
    throw error;
  }

  return true;
}

export async function recordPlatformFailureEvent(
  input: PlatformIncidentInput,
  client: SupabaseClient | null = getServiceClient(),
) {
  if (!client) {
    return false;
  }

  const recorded = await recordPlatformErrorEvent(input, client);
  await updateIncidentForFailure(input, client);

  return recorded;
}

export function recordPlatformFailureEventBestEffort(
  input: PlatformIncidentInput,
  client?: SupabaseClient | null,
) {
  void recordPlatformFailureEvent(input, client).catch((error) => {
    console.error("[Zingara telemetry] Best-effort failure failed", {
      message: error instanceof Error ? error.message : "Unknown error",
      safeFingerprint: input.safeFingerprint,
      service: input.service,
    });
  });
}

export async function recoverPlatformIncident(
  input: {
    fingerprint: string;
    service: string;
    summary?: string;
  },
  client: SupabaseClient | null = getServiceClient(),
) {
  if (!client) {
    return false;
  }

  const fingerprint = trimText(input.fingerprint, 120);
  const service = trimText(input.service, 80);

  if (!fingerprint || !service) {
    return false;
  }

  const now = new Date().toISOString();
  const { error } = await client
    .from("platform_incidents")
    .update({
      recovered_at: now,
      status: "recovered",
      summary: trimText(input.summary, 240) ?? "Service recovered.",
      updated_at: now,
    })
    .eq("service", service)
    .eq("fingerprint", fingerprint)
    .in("status", ["warning", "incident"]);

  if (error) {
    throw error;
  }

  return true;
}

export function recoverPlatformIncidentBestEffort(
  input: {
    fingerprint: string;
    service: string;
    summary?: string;
  },
  client?: SupabaseClient | null,
) {
  void recoverPlatformIncident(input, client).catch((error) => {
    console.error("[Zingara telemetry] Best-effort recovery failed", {
      fingerprint: input.fingerprint,
      message: error instanceof Error ? error.message : "Unknown error",
      service: input.service,
    });
  });
}

export function recordPlatformEventBestEffort(
  input: PlatformEventInput,
  client?: SupabaseClient | null,
) {
  void recordPlatformEvent(input, client).catch((error) => {
    console.error("[Zingara telemetry] Best-effort event failed", {
      eventType: input.eventType,
      message: error instanceof Error ? error.message : "Unknown error",
    });
  });
}

export async function cleanupPlatformTelemetry(
  client: SupabaseClient | null = getServiceClient(),
) {
  if (!client) {
    return null;
  }

  const sessionCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const eventCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const errorEventCutoff = new Date(
    Date.now() - 90 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const incidentCutoff = new Date(
    Date.now() - 365 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const rollupCutoff = new Date(
    Date.now() - 730 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const rateLimitCutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const [sessions, events, errorEvents, incidents, rollups, rateLimits] =
    await Promise.all([
    client
      .from("platform_sessions")
      .delete()
      .lt("last_seen_at", sessionCutoff)
      .select("id"),
    client
      .from("platform_events")
      .delete()
      .lt("created_at", eventCutoff)
      .eq("severity", "info")
      .select("id"),
    client
      .from("platform_events")
      .delete()
      .lt("created_at", errorEventCutoff)
      .in("severity", ["warning", "error"])
      .select("id"),
    client
      .from("platform_incidents")
      .delete()
      .lt("started_at", incidentCutoff)
      .select("id"),
    client
      .from("platform_metric_rollups")
      .delete()
      .lt("period_start", rollupCutoff)
      .select("id"),
    client
      .from("platform_rate_limits")
      .delete()
      .lt("updated_at", rateLimitCutoff)
      .select("id"),
  ]);
  const error =
    sessions.error ??
    events.error ??
    errorEvents.error ??
    incidents.error ??
    rollups.error ??
    rateLimits.error;

  if (error) {
    throw error;
  }

  return {
    errorEventsDeleted: errorEvents.data?.length ?? 0,
    eventsDeleted: events.data?.length ?? 0,
    incidentsDeleted: incidents.data?.length ?? 0,
    rateLimitsDeleted: rateLimits.data?.length ?? 0,
    rollupsDeleted: rollups.data?.length ?? 0,
    sessionsDeleted: sessions.data?.length ?? 0,
  };
}
