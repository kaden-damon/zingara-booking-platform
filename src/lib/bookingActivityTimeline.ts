import type { StaffProfileRow } from "@/lib/supabase/serverAdmin";
import { adminRoleLabels } from "./zingaraAccess.ts";

export type BookingActivityChange = {
  after: unknown;
  before: unknown;
  field: string;
  key?: string;
};

export type BookingActivityEntry = {
  action: string;
  actor: string;
  changes: BookingActivityChange[];
  id: string;
  occurredAt: string;
  outcome: "blocked" | "failed" | "success";
  reason: string | null;
  source: string;
};

const sensitiveKeyPattern =
  /(authorization|cookie|password|secret|token|qr|provider_transaction|payment_identifier|access_key|refresh_key|email|phone|mobile|signature|bank|account_number|billing|address|card_number|session_id|transaction_id|request_id|ticket.?codes?|url|link|hash|checksum)/i;

export function sanitizeTimelineText(value: string) {
  return value
    .replace(
      /(PayFast (?:transaction|payment received):\s*)[A-Z0-9-]+/gi,
      "$1[private reference]",
    )
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[private contact]")
    .replace(/(?:\+27|0)\s?\d{2}(?:[\s()-]?\d){7}\b/g, "[private contact]")
    .replace(/\b\d{12,}\b/g, "[private reference]")
    .replace(/https?:\/\/\S+/gi, "[private link]");
}

export function canAccessBookingActivityTimeline(
  staffProfile: Pick<StaffProfileRow, "active" | "id" | "roles">,
) {
  const role = Array.isArray(staffProfile.roles)
    ? staffProfile.roles[0]
    : staffProfile.roles;

  return staffProfile.active && Object.values(adminRoleLabels).some(
    (name) => name.toLowerCase() === role?.name?.trim().toLowerCase(),
  );
}

export const bookingActivityLabels: Record<string, string> = {
  "booking.create": "Booking created",
  "booking.edit": "Booking details changed",
  "booking.metadata-edit": "Booking notes or details changed",
  "booking.cancel": "Booking cancelled",
  "booking.archive": "Booking moved out of the active list",
  "booking.delete": "Booking removed from the active list",
  "booking.restore": "Booking returned to the active list",
  "booking.reinstated": "Booking confirmed again",
  "booking.provenance-recorded": "Booking source recorded",
  "booking.addons-created": "Extras added",
  "booking.addons-updated": "Extras changed",
  "booking.booking-fee-method-updated": "Booking fee changed for the payment method",
  "booking.company-associated": "Company linked to booking",
  "booking.company-reconciled": "Company details checked",
  "booking.company-review-resolved": "Company details review completed",
  "booking.customer-reassigned": "Booking moved to the correct guest profile",
  "booking.financial-reconciliation": "Booking amounts checked and updated",
  "booking.guest-count-financial-reconciliation": "Guest numbers changed",
  "booking.guest-count-reconciliation": "Guest numbers checked and updated",
  "booking.corporate-guest-count-reconciliation": "Corporate guest numbers updated",
  "booking.legacy-guest-increase-reconciliation": "Guests added to an imported booking",
  "booking.paid-guest-reduction": "Guest numbers reduced",
  "booking.policy-guest-reduction": "Guest numbers reduced",
  "booking.unpaid-guest-reduction-repriced": "Guest numbers and unpaid amount reduced",
  "booking.payment-recorded": "Payment received",
  "booking.payment-edit": "Payment details updated",
  "booking.manual-payment-reversed": "Manually recorded payment reversed",
  "booking.refund": "Refund recorded",
  "booking.payment-reallocation-in": "Payment moved into this booking",
  "booking.payment-reallocation-out": "Payment moved to another booking",
  "payment.allocate": "Payment assigned to booking",
  "payment.management-reallocation": "Payment allocation changed",
  "booking.payfast-payment-reconciled": "PayFast payment checked and recorded",
  "booking.payfast-reversal-reconciled": "PayFast payment reversal recorded",
  "booking.payfast-total-restored": "Booking total corrected to match payment evidence",
  "booking.payment-links-invalidated": "Old payment links stopped",
  "public_checkout.hold.expired": "Booking cancelled: payment time ran out",
  "public_checkout.hold.superseded": "Unpaid reservation replaced by another booking",
  "public_booking.late-payment-recovered": "Payment recorded after expiry; booking restored",
  "public_booking.late-payment-restored": "Payment recorded after expiry; booking restored",
  "public_booking.late-payment-review-required": "Payment recorded after expiry; staff review needed",
  "booking.paid-checkout-queue-recovery-authorised": "Paid booking recovery approved",
  "booking.paid-checkout-queue-recovered": "Paid booking confirmed and added to the seating queue",
  "booking.show-transfer": "Booking moved to another show",
  "booking.restricted-show-approved": "Booking on a restricted show approved",
  "booking.restricted-show-transfer-approved": "Move to a restricted show approved",
  "booking.table-assign": "Table assigned",
  "booking.table-auto-assigned": "Table assigned automatically",
  "booking.table-hybrid-auto-assigned": "Table assigned automatically",
  "booking.table-released": "Table released",
  "booking.table-assignment-integrity-corrected": "Table assignment corrected",
  "booking.table-backlog-reconciled": "Waiting table assignments reviewed",
  "booking.table-phase55-reconciled": "Table assignment reviewed",
  "booking.physical_table_map": "Seating layout updated",
  "booking.physical_table_reallocated": "Booking moved to another table",
  "booking.zone-table-set-reallocated": "Tables changed within the seating area",
  "booking.zone-tables-assigned": "Tables assigned",
  "booking.legacy-assignment-correction": "Imported table assignment corrected",
  "booking.legacy-capacity-correction": "Imported seating capacity reviewed",
  "booking.two-seater-limit-override": "Two-person seating exception approved",
  "booking.temporary-capacity-hold-superseded": "Temporary seating hold replaced",
  "booking.corporate-multi-table-assigned": "Corporate tables assigned",
  "booking.corporate-multi-zone-entitlement-created": "Corporate seating areas reserved",
  "booking.corporate-table-assignment-released": "Corporate table assignment released",
  "booking.corporate-table-released": "Corporate table released",
  "booking.corporate-zone-entitlements-updated": "Corporate seating areas changed",
  "booking.corporate-zone-tables-assigned": "Corporate tables assigned",
  "booking.corporate-zone-transferred": "Corporate booking moved to another seating area",
  "booking.guest-ticket-population-reconciled": "Tickets updated for the guest numbers",
  "booking.guest-ticket-regenerated": "Replacement ticket issued",
  "booking.missing-guest-tickets-reconciled": "Missing guest tickets created",
  "booking.surplus-guest-tickets-invalidated": "Tickets for removed guests cancelled",
  "booking.guest-tickets-restored": "Existing guest tickets restored",
  "booking.staff-guest-allocation-created": "Paid and complimentary guests recorded",
  "booking.corporate-recovered-from-lost-enquiry": "Corporate booking recovered from an earlier enquiry",
  "booking.dineplan-distinct-row-recovered": "Missing imported booking recovered",
  "booking.dineplan-identity-restored": "Imported booking identity corrected",
  "booking.duplicate-warning-overridden": "Possible duplicate reviewed and allowed",
  "booking.potential-duplicate-prevented": "Possible duplicate booking stopped",
  "booking.write-blocked-by-lock": "Change stopped because another staff member was editing",
  "corporate.booking.reinstated": "Corporate booking confirmed again",
  "corporate.booking.expiry-recovered": "Expired Corporate booking recovered",
  "corporate.booking-zone-corrected": "Corporate seating area corrected",
  "corporate.enquiry-converted": "Corporate enquiry turned into a booking",
  "corporate.imported-duplicate-superseded": "Duplicate imported Corporate booking replaced",
  "corporate.imported-financials-reconciled": "Imported Corporate amounts checked",
  "corporate.invoice-booking.created": "Corporate booking created from invoice details",
  "corporate.operations.updated": "Corporate event arrangements updated",
  "corporate.payment_deadline.created": "Corporate payment deadline set",
  "corporate.payment_deadline.expired": "Corporate booking cancelled after its payment deadline",
  "corporate.payment_deadline.protected": "Corporate booking protected from automatic expiry",
  "corporate.payment_deadline.reminder-sent": "Corporate payment reminder sent",
  "corporate.buyout.created": "Buyout booking created",
  "corporate.buyout.released": "Buyout reservation released",
  "corporate.buyout.payment_confirmed": "Buyout payment confirmed",
  "corporate.buyout.ticket-entitlement-issued": "Buyout tickets issued",
  "corporate.buyout.zone-allocation-updated": "Buyout seating areas updated",
  "corporate.buyout.zone-tables-assigned": "Buyout tables assigned",
  "corporate.buyout-package.updated": "Buyout package updated",
  "corporate.buyout.package.created": "Buyout package created",
  "corporate.buyout.package.installed": "Agreed buyout package recorded",
  "corporate.buyout.package.updated": "Buyout package updated",
  "corporate.buyout.component-reconciliation": "Buyout price breakdown checked and updated",
  "xero.sync-retry-requested": "Accounting update requested again",
  xero_quote_draft_created: "Quotation draft created",
  xero_invoice_draft_created: "Invoice draft created",
  xero_credit_note_draft_created: "Credit note draft created",
  xero_quote_accepted: "Quotation acceptance recorded",
  xero_quote_customer_accepted: "Guest accepted the quotation",
  xero_quote_converted_to_invoice_draft: "Invoice draft created from the quotation",
  xero_invoice_requested: "Invoice requested",
  xero_invoice_sync_queued: "Invoice waiting to be sent to accounting",
  xero_invoice_sync_retried: "Invoice accounting update requested again",
  xero_invoice_synced: "Invoice updated in accounting",
  xero_quote_email_provider_accepted: "Quotation email accepted for delivery",
  xero_banking_confirmation_activated: "Banking confirmation document approved",
  xero_bulk_invoice_draft_batch_started: "Invoice draft preparation started",
  "booking-lock.acquire": "Booking opened for editing",
  "booking-lock.release": "Booking closed for editing",
  "booking-lock.reclaim": "Booking editing resumed",
  "booking-lock.stale-expired": "Inactive editing session ended",
  "booking-lock.takeover-requested": "Permission to take over editing requested",
  "booking-lock.takeover-accept": "Editing handed to another staff member",
  "booking-lock.takeover-decline": "Request to take over editing declined",
  "booking-lock.force-takeover": "Editing taken over by an authorised staff member",
};

const fieldLabels: Record<string, string> = {
  booking_status: "Booking status", status: "Status", payment_status: "Payment status",
  guest_count: "Guests", previous_guest_count: "Previous guests", partySize: "Guests",
  section: "Seating area", seating_area: "Seating area", zone_id: "Seating area",
  zone_entitlements: "Guests by seating area", allocations: "Seating capacity",
  amount: "Amount", total_amount: "Booking total", amount_paid: "Paid", balance_outstanding: "Still to pay",
  service_fee: "Gratuity", subtotal_amount: "Ticket total", discount_amount: "Discount",
  addons_total: "Extras total", method: "Payment method", payment_type: "Payment for",
  ticket_status: "Ticket status", count: "Tickets", valid_tickets: "Valid tickets",
  channel: "Sent by", subject: "Message subject", type: "Message type", result: "Scan result",
  device: "Scanner", source: "Booked through", reference: "Reference", version: "Version",
  sync_status: "Accounting update", xero_status: "Accounting status",
  floor_assignment_required: "Waiting for a table", approved_capacity: "Approved seats",
  active_entitlement: "Committed guests", capacity_shortfall: "Seats still needed",
  released_ticket_value: "Removed guests' ticket value", gratuity_transferred: "Gratuity moved to bar",
  bar_tab_amount: "Bar allocation", ticket_amount: "Ticket value", ticket_gratuity_amount: "Ticket gratuity",
  table_id: "Table assignment", show_id: "Show", notes: "Booking notes",
  attendingGuestName: "Attending guest",
};

const stateLabels: Record<string, string> = {
  pending_payment: "Awaiting payment", fully_paid: "Fully paid", deposit_paid: "Deposit paid",
  comp_vip: "Complimentary", new: "New", confirmed: "Confirmed", cancelled: "Cancelled",
  refunded: "Refunded", checked_in: "Checked in", no_show: "Did not attend", completed: "Completed",
  issued: "Issued", valid: "Valid", void: "No longer valid", expired: "Expired",
  platform: "Online payment", full_payment: "Full payment", balance: "Remaining balance",
  deposit: "Deposit", eft: "Bank transfer", data_import: "Imported booking", corporate_direct: "Corporate team",
  requires_floor_assignment: "Waiting for table assignment", online: "Online", admin: "Staff", payfast: "PayFast",
  customer_public: "Online booking", admin_staff: "Staff booking", accepted: "Accepted", rejected: "Not accepted",
  queued: "Waiting to be sent", sent: "Sent", delivered: "Delivered", failed: "Not completed",
  booking_confirmation: "Booking confirmation", payment_confirmation: "Payment confirmation",
  golden_circle: "Golden Circle", middle_ring: "Middle Ring", royal_balcony: "Royal Balcony", royal_booths: "Private Booths",
};

const timelineDateFormat = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Johannesburg",
});

export function formatTimelineTimestamp(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Time unavailable" : timelineDateFormat.format(date);
}

// Presentation only: retain the original entries and pagination as audit evidence.
export function visibleTimelineEntries(entries: BookingActivityEntry[]) {
  const creationTimes = new Set(entries.filter((event) =>
    event.outcome === "success" && event.action === "Booking created" && !event.id.startsWith("booking:"),
  ).map((event) => Date.parse(event.occurredAt)));
  return entries.filter((event) => {
    if (event.outcome !== "success") return true;
    if (event.action === "Booking source recorded") return false;
    if (event.action === "Booking status stayed the same" && event.changes.length === 0) return false;
    return !(event.id.startsWith("booking:") && event.action === "Booking created" && creationTimes.has(Date.parse(event.occurredAt)));
  });
}

export function timelineValue(value: unknown, field = ""): string {
  if (value === null || value === undefined || value === "") return "Not recorded";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return /amount|paid|balance|fee|price|gratuity|discount|value|^total$/i.test(field)
    ? new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(value)
    : String(value);
  if (Array.isArray(value)) return value.length ? value.map((item) => timelineValue(item)).join("; ") : "None";
  if (typeof value === "object") {
    const row = value as Record<string, unknown>;
    if (row.zoneId || row.zone_id) return `${timelineValue(row.zoneId || row.zone_id)}: ${row.pax ?? "Not recorded"} guests`;
    return "Details updated";
  }
  if (/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(String(value))) return "Recorded in booking details";
  if (field === "notes" || String(value).startsWith("__zingara_booking_meta__:")) return "Booking notes updated";
  const text = sanitizeTimelineText(String(value));
  if (/^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(text) && !Number.isNaN(Date.parse(text))) {
    return formatTimelineTimestamp(text);
  }
  return stateLabels[text.toLowerCase().replaceAll("-", "_")] || text.replaceAll("_", " ");
}

export function timelineActor(recordedName?: string | null, hasStaffIdentity = false) {
  const name = recordedName?.trim();
  if (!name) return hasStaffIdentity ? "Staff member (name not recorded)" : "Not recorded";
  if (/^(system|automatic|automation|payfast(?:[ -]itn)?)$/i.test(name)) return "System";
  if (/^(customer|guest)$/i.test(name)) return "Guest";
  if (name === "AUTHORISED SUPPORT RECOVERY") return "Support team (authorised recovery)";
  return sanitizeTimelineText(name);
}

export function presentBookingActivityEntry(
  entry: BookingActivityEntry,
  access: { financial: boolean; privateDetails: boolean },
): BookingActivityEntry {
  const code = entry.action;
  let action = bookingActivityLabels[code] || (/^[A-Za-z][A-Za-z '&()-]+$/.test(code) ? code
    : /refund/i.test(code) ? "Refund details updated" : /ticket|scan/i.test(code) ? "Ticket details updated"
      : /payment/i.test(code) ? "Payment details updated" : /quote|invoice|accounting|xero/i.test(code) ? "Accounting document updated"
        : /communicat|email|message/i.test(code) ? "Message details updated" : "Booking details updated");
  if (code === "booking.edit" && entry.changes.some((change) => change.key === "guest_count")) action = "Guest numbers changed";
  if (code === "Booking first recorded") action = "Booking created";
  if (code === "Ticket issue date recorded") action = "Tickets issued";
  if (code === "Ticket Replacement Recorded") action = "Replacement ticket recorded";
  if (code === "Booking status stayed the same" && entry.reason) action = "Booking note recorded";
  // These events describe a successful protective stop, not a failed payment.
  const describesStop = ["public_booking.late-payment-review-required", "booking.write-blocked-by-lock", "booking.potential-duplicate-prevented"].includes(code);
  if (entry.outcome !== "success" && !describesStop) action = `Not completed: ${action}`;
  let reason = entry.reason;
  if (code === "public_checkout.hold.expired") reason = "No successful payment was recorded before the reservation hold ended. The seats were released.";
  else if (code === "public_booking.late-payment-review-required") reason = "Payment was recorded after the reservation ended. Staff need to review the booking before it can be confirmed.";
  else if (code === "booking.paid-checkout-queue-recovered") reason = "The existing paid booking was confirmed. Box Office still needs to arrange seating.";
  else if (code === "booking.provenance-recorded") reason = "The original booking source and recorded creator were saved.";
  else if (code === "booking.write-blocked-by-lock") reason = "Someone else was editing this booking. No changes were saved by this attempt.";
  else if (code === "Ticket issue date recorded") reason = null;
  else if (!access.privateDetails || !access.financial || /\b[A-Z][A-Z_]{4,}\b/.test(reason || "") || /(?:\b(?:snapshot|idempotenc\w*|entitlement|atomic|hydration|RPC|ITN|server-authoritative|checkout attempt|operational capacity)\b|[a-f0-9]{8}-[a-f0-9-]{27})/i.test(reason || "")) {
    reason = null;
  }
  const financial = /amount|total|paid|balance|fee|price|gratuity|discount|refund|payment|bar|financial|value|cost/i;
  return {
    ...entry, action, actor: timelineActor(entry.actor), reason: reason ? sanitizeTimelineText(reason) : null,
    source: /account|xero|quote|invoice/i.test(entry.source) ? "Quotes and invoices"
      : /ticket|scan/i.test(entry.source) ? "Tickets" : /payment/i.test(entry.source) ? "Payments"
        : /communicat/i.test(entry.source) ? "Messages" : "Booking history",
    changes: entry.changes.filter((change) => change.field !== "Other booking details" && JSON.stringify(change.before) !== JSON.stringify(change.after))
      .filter((change) => access.financial || !financial.test(change.key || change.field))
      .filter((change) => access.privateDetails || (change.field !== "Other booking details" && !/note|subject|customer|diet|request|reason|attending.?guest/i.test(change.key || change.field)))
      .map((change) => ({ field: change.field, before: change.before === undefined ? undefined : timelineValue(change.before, change.key || change.field), after: timelineValue(change.after, change.key || change.field) })),
  };
}

export function humanizeActivityLabel(value: string) {
  return value
    .replace(/^booking\./, "")
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function sanitizeTimelineValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeTimelineValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !sensitiveKeyPattern.test(key))
        .map(([key, nestedValue]) => [key, sanitizeTimelineValue(nestedValue)]),
    );
  }

  return typeof value === "string" ? sanitizeTimelineText(value) : value;
}

export function buildTimelineChanges(
  beforeValues: Record<string, unknown> | null | undefined,
  afterValues: Record<string, unknown> | null | undefined,
  changedFields: string[] = [],
) {
  const before = sanitizeTimelineValue(beforeValues ?? {}) as Record<
    string,
    unknown
  >;
  const after = sanitizeTimelineValue(afterValues ?? {}) as Record<
    string,
    unknown
  >;
  const fields = Array.from(
    new Set(
      (changedFields.length > 0
        ? changedFields
        : [...Object.keys(before), ...Object.keys(after)]
      ).filter((field) => !sensitiveKeyPattern.test(field)),
    ),
  );

  return fields.map((field) => ({
    after: after[field],
    before: before[field],
    field: fieldLabels[field] || "Other booking details",
    key: field,
  })).filter((change) => JSON.stringify(change.before) !== JSON.stringify(change.after));
}

export function sortBookingActivityEntries(entries: BookingActivityEntry[]) {
  return [...new Map(entries.map((entry) => [entry.id, entry])).values()].sort((left, right) => {
    const timeDifference =
      new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime();
    return timeDifference || right.id.localeCompare(left.id);
  });
}

export function legacyTimelineStatusEvents(notes: string | null, recorded: Array<{ id: string; created_at: string; from_status: string | null; to_status: string; note?: string | null; reason?: string | null }>) {
  if (!notes?.startsWith("__zingara_booking_meta__:")) return [];
  let history: unknown;
  try { history = JSON.parse(notes.slice("__zingara_booking_meta__:".length)).lifecycleHistory; }
  catch { return []; }
  if (!Array.isArray(history)) return [];
  const normalStatus = (value: unknown) => typeof value === "string" ? value.replaceAll("-", "_") : null;
  const seen = new Set(recorded.map((row) => `${Date.parse(row.created_at)}:${normalStatus(row.from_status)}:${normalStatus(row.to_status)}:${row.note || row.reason || ""}`));
  return history.slice(0, 500).flatMap((event, index) => {
    if (!event || typeof event.createdAt !== "string" || Number.isNaN(Date.parse(event.createdAt)) || typeof event.toStatus !== "string") return [];
    const key = `${Date.parse(event.createdAt)}:${normalStatus(event.fromStatus)}:${normalStatus(event.toStatus)}:${event.note || ""}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ id: `earlier:${index}`, created_at: event.createdAt, from_status: normalStatus(event.fromStatus), to_status: normalStatus(event.toStatus)!,
      note: typeof event.note === "string" ? event.note : null, reason: null, changed_by: null, earlier: true }];
  });
}
