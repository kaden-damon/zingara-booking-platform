import { cleanupPlatformTelemetry } from "@/lib/platformTelemetry";
import {
  getAdminRoleFromName,
  requireActiveStaff,
} from "@/lib/supabase/serverAdmin";

export const dynamic = "force-dynamic";

type PlatformEventRow = {
  id: string;
  event_type: string;
  severity: "error" | "info" | "warning" | string;
  session_id: string | null;
  journey_id: string | null;
  booking_reference: string | null;
  route: string | null;
  operation: string | null;
  status_code: number | null;
  duration_ms: number | null;
  safe_fingerprint: string | null;
  deployment_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type PlatformIncidentRow = {
  affected_count: number;
  created_at: string;
  deployment_id: string | null;
  fingerprint: string | null;
  id: string;
  metadata: Record<string, unknown> | null;
  recovered_at: string | null;
  service: string;
  started_at: string;
  status: "incident" | "recovered" | "warning" | string;
  summary: string;
  updated_at: string;
};

type PlatformSessionRow = {
  created_at: string;
  current_area: string;
  current_stage: string;
  journey_id: string | null;
  last_seen_at: string;
  metadata: Record<string, unknown> | null;
  session_id: string;
  session_type: "public" | "staff";
  staff_profile_id: string | null;
};

type StaffProfileRow = {
  full_name: string | null;
  id: string;
  roles?: { name?: string | null } | Array<{ name?: string | null }> | null;
};

type PaymentRow = {
  amount: number;
  booking_id: string | null;
  id: string;
  payment_status: string;
  payment_type: string | null;
  processed_at: string | null;
  reference: string | null;
};

type BookingRow = {
  amount_paid: number;
  balance_outstanding: number;
  booking_reference: string;
  booking_status: string;
  id: string;
  payment_status: string;
};

const maxLimit = 100;
const journeyEventTypes = new Set([
  "booking_completed",
  "booking_reserved",
  "checkout_viewed",
  "guest_details_completed",
  "journey_failed",
  "journey_started",
  "location_selected",
  "payfast_returned",
  "payment_confirmed",
  "payment_initiated",
  "seating_selected",
  "show_selected",
]);
const checkoutStages = new Set([
  "Checkout",
  "Redirecting to PayFast",
  "Awaiting Payment Confirmation",
  "PayFast Return",
]);
const performanceOperations = [
  {
    key: "reservation",
    label: "Booking Reservation",
    operations: ["reserve_public_booking_table"],
  },
  {
    key: "checkout",
    label: "PayFast Checkout Preparation",
    operations: ["prepare_payfast_checkout"],
  },
  {
    key: "itn",
    label: "ITN Confirmation",
    operations: ["confirm_payfast_itn", "complete_booking_from_itn"],
  },
];

function getStaffRole(
  staffProfile: NonNullable<
    Awaited<ReturnType<typeof requireActiveStaff>>["staffProfile"]
  >,
) {
  const role = Array.isArray(staffProfile.roles)
    ? staffProfile.roles[0]
    : staffProfile.roles;

  return getAdminRoleFromName(role?.name);
}

function getLimit(value: string | null, fallback: number) {
  return Math.min(Math.max(Number(value ?? fallback) || fallback, 1), maxLimit);
}

function getPeriodStart(period: string | null) {
  const now = Date.now();

  if (period === "7d") {
    return new Date(now - 7 * 24 * 60 * 60 * 1000);
  }

  if (period === "30d") {
    return new Date(now - 30 * 24 * 60 * 60 * 1000);
  }

  if (period === "24h") {
    return new Date(now - 24 * 60 * 60 * 1000);
  }

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  return startOfToday;
}

function getSafeText(value: unknown, maxLength = 120) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function getRoleLabel(roleName: string | null | undefined) {
  return getAdminRoleFromName(roleName) ?? "staff";
}

function getStaffName(profile: StaffProfileRow | undefined) {
  const name = profile?.full_name?.trim();

  return name || "Staff Member";
}

function toStaffMap(rows: StaffProfileRow[] = []) {
  return new Map(
    rows.map((profile) => {
      const role = Array.isArray(profile.roles)
        ? profile.roles[0]
        : profile.roles;

      return [
        profile.id,
        {
          id: profile.id,
          name: getStaffName(profile),
          role: getRoleLabel(role?.name),
        },
      ];
    }),
  );
}

function percentile(values: number[], percentileValue: number) {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.ceil((percentileValue / 100) * sorted.length) - 1,
  );

  return sorted[index] ?? null;
}

function getJourneyStatus(events: PlatformEventRow[], activeSession?: PlatformSessionRow) {
  const eventTypes = new Set(events.map((event) => event.event_type));
  const latestEvent = events[0];
  const latestActivity = new Date(
    activeSession?.last_seen_at ?? latestEvent?.created_at ?? Date.now(),
  ).getTime();
  const isActive = Boolean(
    activeSession && latestActivity >= Date.now() - 3 * 60 * 1000,
  );

  if (eventTypes.has("journey_failed")) {
    return "Failed";
  }

  if (eventTypes.has("booking_completed") || eventTypes.has("payment_confirmed")) {
    return "Completed";
  }

  if (isActive) {
    return "Active";
  }

  const idleMinutes = (Date.now() - latestActivity) / 60_000;

  if (
    (eventTypes.has("payment_initiated") || eventTypes.has("booking_reserved")) &&
    !eventTypes.has("payment_confirmed") &&
    idleMinutes >= 60
  ) {
    return "Awaiting Payment";
  }

  if (
    (eventTypes.has("checkout_viewed") || checkoutStages.has(latestEvent?.metadata?.stage as string)) &&
    !eventTypes.has("booking_reserved") &&
    idleMinutes >= 45
  ) {
    return "Abandoned";
  }

  if (!eventTypes.has("booking_reserved") && idleMinutes >= 30) {
    return "Abandoned";
  }

  return "Active";
}

function formatEventLabel(eventType: string) {
  return eventType
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function buildJourneySummaries(
  events: PlatformEventRow[],
  activeSessions: PlatformSessionRow[],
) {
  const eventsByJourney = new Map<string, PlatformEventRow[]>();
  const sessionsByJourney = new Map<string, PlatformSessionRow>();

  for (const event of events) {
    if (!event.journey_id || !journeyEventTypes.has(event.event_type)) {
      continue;
    }

    const nextEvents = eventsByJourney.get(event.journey_id) ?? [];
    nextEvents.push(event);
    eventsByJourney.set(event.journey_id, nextEvents);
  }

  for (const session of activeSessions) {
    if (session.journey_id) {
      sessionsByJourney.set(session.journey_id, session);
    }
  }

  for (const session of activeSessions) {
    if (session.journey_id && !eventsByJourney.has(session.journey_id)) {
      eventsByJourney.set(session.journey_id, []);
    }
  }

  return Array.from(eventsByJourney.entries())
    .map(([journeyId, journeyEvents]) => {
      const sortedEvents = journeyEvents.sort(
        (left, right) =>
          new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
      );
      const activeSession = sessionsByJourney.get(journeyId);
      const firstEvent = sortedEvents[sortedEvents.length - 1];
      const latestEvent = sortedEvents[0];
      const bookingReference =
        sortedEvents.find((event) => event.booking_reference)?.booking_reference ?? null;
      const telemetryStage = getSafeText(latestEvent?.metadata?.stage);
      const currentStage =
        (activeSession?.current_stage ?? telemetryStage) ||
        formatEventLabel(latestEvent?.event_type ?? "journey_started");

      return {
        bookingReference,
        currentStage,
        eventCount: sortedEvents.length,
        journeyId,
        lastActivity: activeSession?.last_seen_at ?? latestEvent?.created_at ?? null,
        startedAt: firstEvent?.created_at ?? activeSession?.created_at ?? null,
        status: getJourneyStatus(sortedEvents, activeSession),
        timeline: [...sortedEvents].reverse().map((event) => ({
          bookingReference: event.booking_reference,
          createdAt: event.created_at,
          deploymentId: event.deployment_id,
          durationMs: event.duration_ms,
          eventType: event.event_type,
          id: event.id,
          journeyId: event.journey_id,
          label: formatEventLabel(event.event_type),
          operation: event.operation,
          route: event.route,
          safeFingerprint: event.safe_fingerprint,
          severity: event.severity,
          statusCode: event.status_code,
        })),
      };
    })
    .sort(
      (left, right) =>
        new Date(right.lastActivity ?? 0).getTime() -
        new Date(left.lastActivity ?? 0).getTime(),
    );
}

function buildFunnel(events: PlatformEventRow[], journeys: ReturnType<typeof buildJourneySummaries>) {
  const count = (eventType: string) =>
    new Set(
      events
        .filter((event) => event.event_type === eventType && event.journey_id)
        .map((event) => event.journey_id),
    ).size;
  const started = count("journey_started");
  const checkout = count("checkout_viewed");
  const reserved = count("booking_reserved");
  const paymentInitiated = count("payment_initiated");
  const paymentConfirmed = count("payment_confirmed");
  const completed = count("booking_completed");

  return {
    abandoned: journeys.filter((journey) => journey.status === "Abandoned").length,
    bookingCompleted: completed,
    bookingsReserved: reserved,
    failed: journeys.filter((journey) => journey.status === "Failed").length,
    journeyCount: journeys.length,
    journeysStarted: started,
    paymentConfirmed,
    paymentInitiated,
    reachedCheckout: checkout,
    reachedSeating: count("seating_selected"),
    conversion: {
      checkoutToReserved: checkout > 0 ? Math.round((reserved / checkout) * 100) : null,
      reservedToPaid: reserved > 0 ? Math.round((paymentConfirmed / reserved) * 100) : null,
      startedToCheckout: started > 0 ? Math.round((checkout / started) * 100) : null,
      startedToCompleted: started > 0 ? Math.round((completed / started) * 100) : null,
    },
  };
}

function buildPerformance(events: PlatformEventRow[]) {
  return performanceOperations.map((definition) => {
    const matchingEvents = events.filter((event) =>
      definition.operations.includes(event.operation ?? ""),
    );
    const durations = matchingEvents
      .map((event) => event.duration_ms)
      .filter((value): value is number => typeof value === "number");
    const average = durations.length
      ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length)
      : null;

    return {
      averageMs: average,
      errorCount: matchingEvents.filter((event) => event.severity !== "info").length,
      key: definition.key,
      label: definition.label,
      p50Ms: percentile(durations, 50),
      p95Ms: durations.length >= 5 ? percentile(durations, 95) : null,
      p99Ms: durations.length >= 20 ? percentile(durations, 99) : null,
      requestCount: matchingEvents.length,
    };
  });
}

function buildPaymentMilestones(events: PlatformEventRow[], bookings: BookingRow[], payments: PaymentRow[]) {
  const bookingReferences = new Set<string>();

  for (const event of events) {
    if (event.booking_reference) {
      bookingReferences.add(event.booking_reference);
    }
  }

  for (const payment of payments) {
    if (payment.reference) {
      bookingReferences.add(payment.reference);
    }
  }

  return Array.from(bookingReferences)
    .slice(0, 50)
    .map((bookingReference) => {
      const bookingEvents = events.filter(
        (event) => event.booking_reference === bookingReference,
      );
      const booking = bookings.find(
        (row) => row.booking_reference === bookingReference,
      );
      const payment = payments.find((row) => row.reference === bookingReference);
      const hasEvent = (eventType: string) =>
        bookingEvents.some((event) => event.event_type === eventType);
      const communicationSent = bookingEvents.some(
        (event) => event.event_type === "booking_completed",
      );

      return {
        bookingReference,
        milestones: [
          ["Booking Reserved", hasEvent("booking_reserved")],
          ["Checkout Prepared", hasEvent("payment_initiated")],
          ["PayFast Redirect", hasEvent("payment_initiated")],
          ["PayFast Return", hasEvent("payfast_returned")],
          ["ITN Received", hasEvent("payment_confirmed")],
          ["ITN Validated", hasEvent("payment_confirmed")],
          ["Payment Confirmed", hasEvent("payment_confirmed") || booking?.payment_status === "fully_paid"],
          ["Tickets Ready", booking?.booking_status === "confirmed"],
          ["Confirmation Sent", communicationSent],
        ].map(([label, recorded]) => ({
          label,
          status: recorded ? "Recorded" : "Not recorded",
        })),
        paymentStatus: booking?.payment_status ?? payment?.payment_status ?? "Not recorded",
      };
    });
}

export async function GET(request: Request) {
  const { error, serviceClient, staffProfile } = await requireActiveStaff(request);

  if (error || !serviceClient || !staffProfile) {
    return error;
  }

  if (getStaffRole(staffProfile) !== "super-admin") {
    return Response.json(
      { error: "Platform Operations is restricted to Super Admin." },
      { status: 403 },
    );
  }

  const url = new URL(request.url);
  const period = url.searchParams.get("period") ?? "today";
  const sinceDate = getPeriodStart(period);
  const since = sinceDate.toISOString();
  const activeSince = new Date(Date.now() - 3 * 60 * 1000).toISOString();
  const limit = getLimit(url.searchParams.get("limit"), 75);
  const bookingSearch = getSafeText(url.searchParams.get("booking"), 80);
  const severityFilter = getSafeText(url.searchParams.get("severity"), 24);

  const [
    { data: activeSessions, error: sessionsError },
    { data: recentEvents, error: eventsError },
    { data: incidents, error: incidentsError },
    { data: staffProfiles, error: staffError },
    { data: bookings, error: bookingsError },
    { data: payments, error: paymentsError },
  ] = await Promise.all([
    serviceClient
      .from("platform_sessions")
      .select(
        "session_id,session_type,staff_profile_id,journey_id,current_area,current_stage,last_seen_at,created_at,metadata",
      )
      .gte("last_seen_at", activeSince)
      .order("last_seen_at", { ascending: false })
      .limit(limit),
    serviceClient
      .from("platform_events")
      .select(
        "id,event_type,severity,session_id,journey_id,booking_reference,route,operation,status_code,duration_ms,safe_fingerprint,deployment_id,metadata,created_at",
      )
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(500),
    serviceClient
      .from("platform_incidents")
      .select(
        "id,service,status,started_at,recovered_at,fingerprint,summary,affected_count,deployment_id,metadata,created_at,updated_at",
      )
      .gte("started_at", new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString())
      .order("started_at", { ascending: false })
      .limit(limit),
    serviceClient
      .from("staff_profiles")
      .select("id,full_name,roles(name)"),
    serviceClient
      .from("bookings")
      .select("id,booking_reference,booking_status,payment_status,amount_paid,balance_outstanding")
      .limit(500),
    serviceClient
      .from("payments")
      .select("id,booking_id,reference,payment_status,payment_type,amount,processed_at")
      .gte("processed_at", since)
      .limit(500),
  ]);

  const loadError =
    sessionsError ??
    eventsError ??
    incidentsError ??
    staffError ??
    bookingsError ??
    paymentsError ??
    null;

  if (loadError) {
    console.error("[Zingara Platform Operations] Failed to load telemetry", {
      message: loadError.message,
    });

    return Response.json(
      { error: "Platform Operations telemetry could not be loaded." },
      { status: 500 },
    );
  }

  const staffMap = toStaffMap((staffProfiles ?? []) as StaffProfileRow[]);
  const activeSessionRows = (activeSessions ?? []) as PlatformSessionRow[];
  const eventRows = ((recentEvents ?? []) as PlatformEventRow[]).filter((event) => {
    if (bookingSearch && event.booking_reference !== bookingSearch) {
      return false;
    }

    if (severityFilter && severityFilter !== "all" && event.severity !== severityFilter) {
      return false;
    }

    return true;
  });
  const incidentRows = (incidents ?? []) as PlatformIncidentRow[];
  const bookingRows = (bookings ?? []) as BookingRow[];
  const paymentRows = (payments ?? []) as PaymentRow[];
  const journeys = buildJourneySummaries(eventRows, activeSessionRows).slice(0, limit);
  const funnel = buildFunnel(eventRows, journeys);
  const activePublicSessions = activeSessionRows.filter(
    (session) => session.session_type === "public",
  );
  const activeStaffSessions = activeSessionRows.filter(
    (session) => session.session_type === "staff",
  );
  const recentErrors = eventRows
    .filter((event) => event.severity === "warning" || event.severity === "error")
    .slice(0, limit);
  const checkoutFailures = eventRows.filter(
    (event) =>
      event.event_type === "journey_failed" &&
      event.operation === "prepare_payfast_checkout",
  );
  const reservationConflicts = eventRows.filter(
    (event) => event.safe_fingerprint === "public_booking_availability_conflict",
  );
  const awaitingPayment = bookingRows.filter(
    (booking) => booking.payment_status === "pending_payment",
  ).length;
  const confirmedPayments = paymentRows.filter(
    (payment) => payment.payment_status === "fully_paid" || payment.payment_status === "deposit_paid",
  ).length;

  return Response.json({
    activeNowThreshold: activeSince,
    filters: {
      booking: bookingSearch,
      limit,
      period,
      severity: severityFilter || "all",
    },
    overview: {
      activeNow: activeSessionRows.length,
      atCheckout: activeSessionRows.filter((session) =>
        checkoutStages.has(session.current_stage),
      ).length,
      awaitingPayment,
      bookingJourneys: journeys.length,
      platformStatus:
        recentErrors.some((event) => event.severity === "error") ||
        incidentRows.some((incident) => incident.status !== "recovered")
          ? "Attention"
          : "Monitoring",
      publicGuests: activePublicSessions.length,
      recentErrors: recentErrors.length,
      staffOnline: activeStaffSessions.length,
    },
    activeSessions: activeSessionRows.slice(0, limit).map((session) => ({
      currentArea: session.current_area,
      currentStage: session.current_stage,
      displayName:
        session.session_type === "staff"
          ? staffMap.get(session.staff_profile_id ?? "")?.name ?? "Staff Member"
          : "Public Guest",
      journeyId: session.journey_id,
      lastSeenAt: session.last_seen_at,
      role:
        session.session_type === "staff"
          ? staffMap.get(session.staff_profile_id ?? "")?.role ?? "staff"
          : null,
      sessionId: session.session_id,
      sessionType: session.session_type,
      startedAt: session.created_at,
    })),
    journeys,
    funnel,
    payments: {
      awaitingPayment,
      checkoutPreparationFailures: checkoutFailures.length,
      confirmed: confirmedPayments,
      failed: paymentRows.filter((payment) => payment.payment_status === "failed").length,
      milestones: buildPaymentMilestones(eventRows, bookingRows, paymentRows),
      recentItnFailures: eventRows.filter(
        (event) =>
          event.operation === "confirm_payfast_itn" && event.severity !== "info",
      ).length,
    },
    errors: recentErrors.map((event) => ({
      bookingReference: event.booking_reference,
      createdAt: event.created_at,
      deploymentId: event.deployment_id,
      durationMs: event.duration_ms,
      eventType: event.event_type,
      id: event.id,
      journeyId: event.journey_id,
      operation: event.operation,
      route: event.route,
      safeFingerprint: event.safe_fingerprint,
      severity: event.severity,
      statusCode: event.status_code,
    })),
    incidents: incidentRows,
    healthHistory: {
      currentSystemStatusSource: "/api/admin/system-status",
      incidents: incidentRows,
      message:
        incidentRows.length === 0
          ? "No recorded platform incidents."
          : "Persisted platform incident history is available.",
    },
    performance: buildPerformance(eventRows),
    reservationConflicts: {
      count: reservationConflicts.length,
      rate:
        eventRows.length > 0
          ? Math.round((reservationConflicts.length / eventRows.length) * 100)
          : null,
      rows: reservationConflicts.slice(0, limit).map((event) => ({
        bookingReference: event.booking_reference,
        createdAt: event.created_at,
        journeyId: event.journey_id,
        route: event.route,
        statusCode: event.status_code,
      })),
    },
    recentTechnicalEvents: eventRows
      .filter((event) =>
        [
          "booking_completed",
          "booking_reserved",
          "journey_failed",
          "payment_confirmed",
          "payment_initiated",
          "rate_limited",
        ].includes(event.event_type),
      )
      .slice(0, limit)
      .map((event) => ({
        bookingReference: event.booking_reference,
        createdAt: event.created_at,
        durationMs: event.duration_ms,
        eventType: event.event_type,
        id: event.id,
        journeyId: event.journey_id,
        label: formatEventLabel(event.event_type),
        operation: event.operation,
        route: event.route,
        severity: event.severity,
        statusCode: event.status_code,
      })),
    retention: {
      strategy: {
        platformEvents: "30 days raw; warning/error rows retained 90 days",
        platformIncidents: "12 months",
        platformMetricRollups: "24 months",
        platformSessions: "24 hours",
      },
    },
  });
}

export async function POST(request: Request) {
  const { error, serviceClient, staffProfile } = await requireActiveStaff(request);

  if (error || !serviceClient || !staffProfile) {
    return error;
  }

  if (getStaffRole(staffProfile) !== "super-admin") {
    return Response.json(
      { error: "Platform Operations is restricted to Super Admin." },
      { status: 403 },
    );
  }

  const payload = (await request.json().catch(() => null)) as { action?: string } | null;

  if (payload?.action !== "cleanup") {
    return Response.json({ error: "Unsupported Platform Operations action." }, { status: 400 });
  }

  try {
    const cleanup = await cleanupPlatformTelemetry(serviceClient);

    return Response.json({ cleanup });
  } catch (cleanupError) {
    console.error("[Zingara Platform Operations] Retention cleanup failed", {
      message:
        cleanupError instanceof Error ? cleanupError.message : "Unknown error",
    });

    return Response.json(
      { error: "Telemetry retention cleanup could not be completed." },
      { status: 500 },
    );
  }
}
