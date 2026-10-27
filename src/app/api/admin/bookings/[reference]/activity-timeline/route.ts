import {
  buildTimelineChanges,
  canAccessBookingActivityTimeline,
  humanizeActivityLabel,
  sanitizeTimelineText,
  sortBookingActivityEntries,
  type BookingActivityEntry,
} from "@/lib/bookingActivityTimeline";
import { requireActiveStaff } from "@/lib/supabase/serverAdmin";

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
  fallback = "System",
) {
  return (id && identities.get(id)) || fallback;
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

  if (!/^ZNG-[A-Z0-9-]+$/.test(bookingReference)) {
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
      "id,booking_reference,booking_source,booking_origin,guest_count,booking_status,payment_status,section,total_amount,amount_paid,balance_outstanding,created_at,created_by_staff_id",
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
      serviceClient
        .from("payments")
        .select("id,payment_type,payment_status,amount,method,notes,processed_by,processed_at,created_at")
        .eq("booking_id", booking.id)
        .order("created_at", { ascending: false })
        .limit(candidateLimit),
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
      serviceClient
        .from("xero_documents")
        .select(
          "id,kind,local_reference,status,version,total_cents,sync_status,xero_status,created_by_staff_profile_id,updated_by_staff_profile_id,created_at,updated_at,accepted_at,invoice_requested_at,invoice_requested_by_staff_profile_id",
        )
        .eq("source_booking_id", booking.id)
        .order("created_at", { ascending: false })
        .limit(candidateLimit),
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
        : "Booking Created",
      actor: actorName(
        identities,
        booking.created_by_staff_id,
        /online|public/i.test(booking.booking_source) ? "Guest" : "System",
      ),
      changes: buildTimelineChanges({}, {
        booking_status: booking.booking_status,
        guest_count: booking.guest_count,
        payment_status: booking.payment_status,
        seating_area: booking.section,
        source: booking.booking_source,
      }),
      id: `booking:${booking.id}:created`,
      occurredAt: booking.created_at,
      reason: null,
      source: booking.booking_origin || booking.booking_source || "Booking",
    }),
  );

  for (const row of auditResult.data ?? []) {
    entries.push(
      entry({
        action: humanizeActivityLabel(row.action),
        actor: row.actor_name || actorName(identities, row.actor_staff_profile_id || row.actor_auth_user_id),
        changes: buildTimelineChanges(row.before_values, row.after_values, row.changed_fields ?? []),
        id: `audit:${row.id}`,
        occurredAt: row.created_at,
        outcome: row.outcome,
        reason: row.reason,
        source: humanizeActivityLabel(row.source_area),
      }),
    );
  }

  for (const row of documentAuditResult.data ?? []) {
    entries.push(
      entry({
        action: humanizeActivityLabel(row.action),
        actor:
          row.actor_name ||
          actorName(
            identities,
            row.actor_staff_profile_id || row.actor_auth_user_id,
          ),
        changes: buildTimelineChanges(
          row.before_values,
          row.after_values,
          row.changed_fields ?? [],
        ),
        id: `accounting-audit:${row.id}`,
        occurredAt: row.created_at,
        outcome: row.outcome,
        reason: row.reason,
        source: humanizeActivityLabel(row.source_area),
      }),
    );
  }

  for (const row of lifecycleResult.data ?? []) {
    entries.push(entry({
      action: "Booking Status Changed",
      actor: actorName(identities, row.changed_by),
      changes: buildTimelineChanges({ status: row.from_status }, { status: row.to_status }),
      id: `lifecycle:${row.id}`,
      occurredAt: row.created_at,
      reason: row.reason || row.note,
      source: "Booking Lifecycle",
    }));
  }

  for (const row of paymentResult.data ?? []) {
    entries.push(entry({
      action: "Payment Recorded",
      actor: actorName(identities, row.processed_by, row.method ? "Payment Provider" : "System"),
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
    entries.push(entry({
      action: row.sent_at ? "Communication Sent" : "Communication Recorded",
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
      action: row.result === "checked_in" ? "Ticket Checked In" : "Ticket Validation",
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
        status: row.status,
        sync_status: row.sync_status,
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
      actor: "System",
      changes: buildTimelineChanges({}, { status: row.ticket_status }),
      id: `ticket:${row.id}:replacement`,
      occurredAt: row.replacement_recorded_at,
      reason: null,
      source: "Ticketing",
    }));
  }
  for (const [key, group] of ticketGroups) entries.push(entry({
    action: "Tickets Issued",
    actor: "System",
    changes: buildTimelineChanges({}, { count: group.count, status: group.status }),
    id: `tickets:${key}`,
    occurredAt: group.occurredAt,
    reason: null,
    source: "Ticketing",
  }));

  const ordered = sortBookingActivityEntries(entries);
  const offset = (page - 1) * pageSize;
  const pageEntries = ordered.slice(offset, offset + pageSize);

  return Response.json({
    bookingReference,
    events: pageEntries,
    hasMore: ordered.length > offset + pageSize,
    historyNotice:
      "The timeline shows authoritative evidence retained by Zingara. Activity before a source began recording may be unavailable.",
    page,
    pageSize,
  });
}
