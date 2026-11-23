import {
  buildTimelineChanges,
  canAccessBookingActivityTimeline,
  legacyTimelineStatusEvents,
  presentBookingActivityEntry,
  timelineActor,
  sanitizeTimelineText,
  sortBookingActivityEntries,
  type BookingActivityEntry,
} from "@/lib/bookingActivityTimeline";
import { getRolePermissions, requireActiveStaff } from "@/lib/supabase/serverAdmin";
import { normalizeStaffLocation, normalizeStaffVenueScope } from "@/lib/staffLocations";

export const dynamic = "force-dynamic";

const pageSize = 25;
const maximumPage = 20;

type RouteContext = {
  params: Promise<{ reference: string }>;
};

type StaffIdentity = { full_name: string; id: string; user_id: string };

function actorName(
  identities: Map<string, string>,
  id: string | null | undefined,
  fallback = "Not recorded",
) {
  return (id && identities.get(id)) || (id ? "Staff member (name not recorded)" : fallback);
}

function auditActorName(
  identities: Map<string, string>,
  row: {
    actor_staff_profile_id: string | null;
    actor_auth_user_id: string | null;
    actor_name: string | null;
  },
) {
  return (row.actor_staff_profile_id && identities.get(row.actor_staff_profile_id))
    || (row.actor_auth_user_id && identities.get(row.actor_auth_user_id))
    || timelineActor(row.actor_name, Boolean(row.actor_staff_profile_id || row.actor_auth_user_id));
}

function entry(
  value: Omit<BookingActivityEntry, "outcome"> & {
    outcome?: BookingActivityEntry["outcome"];
  },
): BookingActivityEntry {
  return {
    ...value,
    reason: value.reason ? sanitizeTimelineText(value.reason) : null,
    outcome: value.outcome ?? "success",
  };
}

export async function GET(request: Request, context: RouteContext) {
  const auth = await requireActiveStaff(request);

  if (auth.error || !auth.serviceClient || !auth.staffProfile) {
    return auth.error;
  }

  if (!canAccessBookingActivityTimeline(auth.staffProfile)) {
    return Response.json(
      { error: "Booking Activity Timeline access is restricted." },
      { status: 403 },
    );
  }

  const { reference } = await context.params;
  const bookingReference = decodeURIComponent(reference).trim().toUpperCase();

  if (!/^(?:ZNG|DP)-[A-Z0-9-]+$/.test(bookingReference)) {
    return Response.json({ error: "Invalid booking reference." }, { status: 400 });
  }

  const url = new URL(request.url);
  const requestedPage = Number(url.searchParams.get("page") ?? "1");
  const page = Number.isInteger(requestedPage)
    ? Math.min(Math.max(requestedPage, 1), maximumPage)
    : 1;
  const candidateLimit = Math.min(page * pageSize + 1, maximumPage * pageSize);
  const serviceClient = auth.serviceClient;

  const { data: booking, error: bookingError } = await serviceClient
    .from("bookings")
    .select(
      "id,booking_reference,booking_source,booking_origin,created_at,created_by_staff_id,notes,show:shows!bookings_show_id_fkey(venue)",
    )
    .eq("booking_reference", bookingReference)
    .maybeSingle();

  if (bookingError) {
    console.error("[Booking Activity Timeline] Booking lookup failed", bookingError);
    return Response.json({ error: "Booking activity could not be loaded." }, { status: 500 });
  }

  if (!booking) {
    return Response.json({ error: "Booking could not be found." }, { status: 404 });
  }

  const show = Array.isArray(booking.show) ? booking.show[0] : booking.show;
  const venue = normalizeStaffLocation(show?.venue);
  const scope = normalizeStaffVenueScope(auth.staffProfile.venue_scope ?? []);
  if (!venue || (!scope.includes("all") && !scope.includes(venue))) {
    return Response.json({ error: "This booking is outside your assigned venue." }, { status: 403 });
  }
  const role = Array.isArray(auth.staffProfile.roles) ? auth.staffProfile.roles[0] : auth.staffProfile.roles;
  const permissions = getRolePermissions(role);
  const access = {
    financial: permissions.includes("bookings:manage") || permissions.includes("analytics:read"),
    privateDetails: permissions.includes("bookings:manage") || permissions.includes("crm:read"),
  };

  const [auditResult, lifecycleResult, paymentResult, communicationResult, validationResult, documentResult, ticketResult] =
    await Promise.all([
      serviceClient
        .from("audit_events")
        .select(
          "id,created_at,actor_staff_profile_id,actor_auth_user_id,actor_name,action,outcome,source_area,reason,before_values,after_values,changed_fields",
        )
        .eq("entity_type", "booking")
        .eq("entity_reference", bookingReference)
        .order("created_at", { ascending: false })
        .limit(candidateLimit),
      serviceClient
        .from("booking_lifecycle_events")
        .select("id,from_status,to_status,note,reason,changed_by,created_at")
        .eq("booking_id", booking.id)
        .order("created_at", { ascending: false })
        .limit(candidateLimit),
      access.financial ? serviceClient
        .from("payments")
        .select("id,payment_type,payment_status,amount,method,notes,processed_by,processed_at,created_at")
        .eq("booking_id", booking.id)
        .order("created_at", { ascending: false })
        .limit(candidateLimit) : Promise.resolve({ data: [], error: null }),
      serviceClient
        .from("communications")
        .select("id,type,channel,subject,status,sent_at,created_by,created_at")
        .eq("booking_id", booking.id)
        .order("created_at", { ascending: false })
        .limit(candidateLimit),
      serviceClient
        .from("ticket_validations")
        .select("id,result,device_label,notes,validated_by,validated_at")
        .eq("booking_id", booking.id)
        .order("validated_at", { ascending: false })
        .limit(candidateLimit),
      access.financial ? serviceClient
        .from("xero_documents")
        .select(
          "id,kind,local_reference,status,version,total_cents,sync_status,xero_status,created_by_staff_profile_id,updated_by_staff_profile_id,created_at,updated_at,accepted_at,invoice_requested_at,invoice_requested_by_staff_profile_id",
        )
        .eq("source_booking_id", booking.id)
        .order("created_at", { ascending: false })
        .limit(candidateLimit) : Promise.resolve({ data: [], error: null }),
      serviceClient
        .from("tickets")
        .select("id,ticket_status,issued_at,replacement_recorded_at")
        .eq("booking_id", booking.id)
        .order("issued_at", { ascending: false })
        .limit(500),
    ]);

  const results = [auditResult, lifecycleResult, paymentResult, communicationResult, validationResult, documentResult, ticketResult];
  const failedResult = results.find((result) => result.error);

  if (failedResult?.error) {
    console.error("[Booking Activity Timeline] Evidence lookup failed", failedResult.error);
    return Response.json({ error: "Booking activity could not be loaded." }, { status: 500 });
  }

  const linkedDocuments = documentResult.data ?? [];
  const documentAuditResult = linkedDocuments.length
    ? await serviceClient
        .from("audit_events")
        .select(
          "id,created_at,actor_staff_profile_id,actor_auth_user_id,actor_name,action,outcome,source_area,reason,before_values,after_values,changed_fields",
        )
        .eq("entity_type", "accounting-document")
        .or(
          `entity_id.in.(${linkedDocuments.map((document) => document.id).join(",")}),entity_reference.in.(${linkedDocuments.map((document) => document.local_reference).join(",")})`,
        )
        .order("created_at", { ascending: false })
        .limit(candidateLimit)
    : { data: [], error: null };

  if (documentAuditResult.error) {
    console.error(
      "[Booking Activity Timeline] Accounting audit lookup failed",
      documentAuditResult.error,
    );
    return Response.json({ error: "Booking activity could not be loaded." }, { status: 500 });
  }

  const identityIds = new Set<string>();
  const collect = (value: string | null | undefined) => value && identityIds.add(value);
  collect(booking.created_by_staff_id);
  for (const row of auditResult.data ?? []) {
    collect(row.actor_staff_profile_id);
    collect(row.actor_auth_user_id);
  }
  for (const row of documentAuditResult.data ?? []) {
    collect(row.actor_staff_profile_id);
    collect(row.actor_auth_user_id);
  }
  for (const row of lifecycleResult.data ?? []) collect(row.changed_by);
  for (const row of paymentResult.data ?? []) collect(row.processed_by);
  for (const row of communicationResult.data ?? []) collect(row.created_by);
  for (const row of validationResult.data ?? []) collect(row.validated_by);
  for (const row of documentResult.data ?? []) {
    collect(row.created_by_staff_profile_id);
    collect(row.updated_by_staff_profile_id);
    collect(row.invoice_requested_by_staff_profile_id);
  }

  const { data: staffRows, error: staffError } = identityIds.size
    ? await serviceClient
        .from("staff_profiles")
        .select("id,user_id,full_name")
        .or(
          `id.in.(${Array.from(identityIds).join(",")}),user_id.in.(${Array.from(identityIds).join(",")})`,
        )
    : { data: [], error: null };

  if (staffError) {
    console.error("[Booking Activity Timeline] Staff attribution lookup failed", staffError);
    return Response.json({ error: "Booking activity could not be loaded." }, { status: 500 });
  }

  const identities = new Map<string, string>();
  for (const staff of (staffRows ?? []) as StaffIdentity[]) {
    identities.set(staff.id, staff.full_name);
    identities.set(staff.user_id, staff.full_name);
  }

  const entries: BookingActivityEntry[] = [];
  entries.push(
    entry({
      action: /dineplan|import/i.test(`${booking.booking_source} ${booking.booking_origin}`)
        ? "Dineplan Booking Imported"
        : "Booking first recorded",
      actor: actorName(
        identities,
        booking.created_by_staff_id,
        /online|public/i.test(booking.booking_source) ? "Guest"
          : /dineplan|import/i.test(`${booking.booking_source} ${booking.booking_origin}`) ? "System" : "Not recorded",
      ),
      changes: buildTimelineChanges({}, { source: booking.booking_source }),
      id: `booking:${booking.id}:created`,
      occurredAt: booking.created_at,
      reason: null,
      source: booking.booking_origin || booking.booking_source || "Booking",
    }),
  );

  for (const row of auditResult.data ?? []) {
    entries.push(
      entry({
        action: row.action,
        actor: auditActorName(identities, row),
        changes: buildTimelineChanges(row.before_values, row.after_values, row.changed_fields ?? []),
        id: `audit:${row.id}`,
        occurredAt: row.created_at,
        outcome: row.outcome,
        reason: row.reason,
        source: row.source_area,
      }),
    );
  }

  for (const row of documentAuditResult.data ?? []) {
    entries.push(
      entry({
        action: row.action,
        actor: auditActorName(identities, row),
        changes: buildTimelineChanges(
          row.before_values,
          row.after_values,
          row.changed_fields ?? [],
        ),
        id: `accounting-audit:${row.id}`,
        occurredAt: row.created_at,
        outcome: row.outcome,
        reason: row.reason,
        source: row.source_area,
      }),
    );
  }

  const statusEvents = [...(lifecycleResult.data ?? []), ...legacyTimelineStatusEvents(booking.notes, lifecycleResult.data ?? [])];
  for (const row of statusEvents) {
    entries.push(entry({
      action: row.from_status === row.to_status ? "Booking status stayed the same"
        : row.from_status === null ? "Booking created" : "Booking status changed",
      actor: actorName(identities, row.changed_by, "earlier" in row ? "Not recorded"
        : row.note === "Online booking created with server-authoritative pricing" && booking.booking_origin === "customer_public" ? "Guest"
          : row.note === "Public checkout hold expired" || row.note === "Awaiting PayFast payment" || /^PayFast payment received:/.test(row.note || "") ? "System" : "Not recorded"),
      changes: buildTimelineChanges({ status: row.from_status }, { status: row.to_status }),
      id: `lifecycle:${row.id}`,
      occurredAt: row.created_at,
      reason: row.reason || row.note,
      source: "Booking Lifecycle",
    }));
  }

  for (const row of paymentResult.data ?? []) {
    // A zero-value unpaid reservation row is not a payment attempt or receipt.
    if (Number(row.amount) === 0 && row.payment_status === "pending_payment") continue;
    entries.push(entry({
      action: row.payment_status === "pending_payment" ? "Payment started; not yet confirmed"
        : row.payment_status === "fully_paid" || row.payment_status === "deposit_paid" ? "Payment received" : "Payment status recorded",
      actor: actorName(identities, row.processed_by, /platform|payfast/i.test(row.method || "") ? "System" : "Not recorded"),
      changes: buildTimelineChanges({}, {
        amount: Number(row.amount),
        method: row.method,
        payment_status: row.payment_status,
        payment_type: row.payment_type,
      }),
      id: `payment:${row.id}`,
      occurredAt: row.processed_at || row.created_at,
      reason: row.notes,
      source: "Payments",
    }));
  }

  for (const row of communicationResult.data ?? []) {
    const message = row.type === "booking_confirmation" ? "Booking confirmation"
      : row.type === "payment_confirmation" ? "Payment confirmation" : "Message";
    const channel = row.channel === "email" ? " email" : row.channel === "sms" ? " text message" : "";
    entries.push(entry({
      action: row.status === "failed" ? `${message}${channel} not sent`
        : row.sent_at ? `${message}${channel} sent` : `${message}${channel} waiting to be sent`,
      actor: actorName(identities, row.created_by),
      changes: buildTimelineChanges({}, {
        channel: row.channel,
        status: row.status,
        subject: row.subject,
        type: row.type,
      }),
      id: `communication:${row.id}`,
      occurredAt: row.sent_at || row.created_at,
      reason: null,
      source: "Communications",
    }));
  }

  for (const row of validationResult.data ?? []) {
    entries.push(entry({
      action: row.result === "checked_in" || row.result === "accepted" ? "Guest checked in" : "Ticket scan result",
      actor: actorName(identities, row.validated_by),
      changes: buildTimelineChanges({}, { device: row.device_label, result: row.result }),
      id: `ticket-validation:${row.id}`,
      occurredAt: row.validated_at,
      reason: row.notes,
      source: "Ticket Scanning",
    }));
  }

  for (const row of documentResult.data ?? []) {
    entries.push(entry({
      action: `${row.kind === "quote" ? "Quotation" : "Invoice"} Created`,
      actor: actorName(identities, row.created_by_staff_profile_id),
      changes: buildTimelineChanges({}, {
        amount: Number(row.total_cents) / 100,
        reference: row.local_reference,
        version: row.version,
      }),
      id: `accounting:${row.id}:created`,
      occurredAt: row.created_at,
      reason: null,
      source: "Quote & Invoice Management",
    }));
    if (row.accepted_at) entries.push(entry({
      action: "Quotation Accepted",
      actor: "Customer",
      changes: buildTimelineChanges({}, { reference: row.local_reference, version: row.version }),
      id: `accounting:${row.id}:accepted`,
      occurredAt: row.accepted_at,
      reason: null,
      source: "Quote Acceptance",
    }));
    if (row.invoice_requested_at) entries.push(entry({
      action: "Invoice Requested",
      actor: actorName(identities, row.invoice_requested_by_staff_profile_id),
      changes: buildTimelineChanges({}, { reference: row.local_reference, version: row.version }),
      id: `accounting:${row.id}:invoice-requested`,
      occurredAt: row.invoice_requested_at,
      reason: null,
      source: "Quote & Invoice Management",
    }));
  }

  const ticketGroups = new Map<string, { count: number; occurredAt: string; status: string }>();
  for (const row of ticketResult.data ?? []) {
    const key = `${row.issued_at}:${row.ticket_status}`;
    const group = ticketGroups.get(key) ?? { count: 0, occurredAt: row.issued_at, status: row.ticket_status };
    group.count += 1;
    ticketGroups.set(key, group);
    if (row.replacement_recorded_at) entries.push(entry({
      action: "Ticket Replacement Recorded",
      actor: "Not recorded",
      changes: [],
      id: `ticket:${row.id}:replacement`,
      occurredAt: row.replacement_recorded_at,
      reason: null,
      source: "Ticketing",
    }));
  }
  for (const [key, group] of ticketGroups) entries.push(entry({
    action: "Ticket issue date recorded",
    actor: "Not recorded",
    changes: buildTimelineChanges({}, { count: group.count }),
    id: `tickets:${key}`,
    occurredAt: group.occurredAt,
    reason: "This is the issue date recorded on the tickets. Later changes appear separately when recorded.",
    source: "Ticketing",
  }));

  const ordered = sortBookingActivityEntries(entries.map((value) => presentBookingActivityEntry(value, access)));
  const offset = (page - 1) * pageSize;
  const pageEntries = ordered.slice(offset, offset + pageSize);

  return Response.json({
    bookingReference,
    events: pageEntries,
    hasMore: ordered.length > offset + pageSize,
    historyNotice:
      "Newest activity first. Some older activity may not have been recorded. Details follow your existing staff access.",
    page,
    pageSize,
  });
}
