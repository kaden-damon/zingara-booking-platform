import {
  type BookingStatus,
  type BookingLifecycleEvent,
  type CommunicationChannel,
  type CommunicationRecord,
  type CommunicationTrigger,
  type DemoBooking,
  type PaymentStatus,
  type SeatingZoneId,
  createTicketCode,
  getDisplayZoneTitle,
  isValidSeatingZoneId,
} from "@/lib/zingaraDemo";
import { getSupabaseClient } from "./client";
import { fetchSupabaseApi } from "./apiClient";
import { getOrCreateCustomerIdFromInfo } from "./customers";
import { resolveStaffDisplayName } from "@/lib/staffDisplayName";

type SupabaseBookingStatus =
  | "cancelled"
  | "checked_in"
  | "completed"
  | "confirmed"
  | "new"
  | "no_show"
  | "pending_payment"
  | "refunded"
  | "waitlisted";

type SupabasePaymentStatus =
  | "cancelled"
  | "comp_vip"
  | "deposit_paid"
  | "fully_paid"
  | "pending_payment"
  | "refunded";

type SupabaseBookingRow = {
  addons_total: number;
  amount_paid: number;
  archive_reason: string | null;
  archived_at: string | null;
  archived_by: string | null;
  balance_outstanding: number;
  booking_reference: string;
  booking_origin: DemoBooking["bookingOrigin"] | null;
  booking_source: string;
  booking_status: SupabaseBookingStatus;
  company_name: string | null;
  created_at: string;
  created_by_staff_id: string | null;
  created_by_staff?: {
    email: string | null;
    full_name: string;
    id: string;
  } | null;
  customer_id: string;
  dietary_requirements: string | null;
  discount_amount: number;
  guest_count: number;
  id: string;
  notes: string | null;
  payment_status: SupabasePaymentStatus;
  section: string | null;
  service_fee: number;
  show_id: string;
  subtotal_amount: number;
  table_id: string | null;
  total_amount: number;
  updated_at?: string;
};

type SupabaseShowRow = {
  date: string;
  id: string;
  notes: string | null;
  time: string;
};

type SupabaseCommunicationChannel =
  | "email"
  | "internal_note"
  | "push"
  | "sms"
  | "whatsapp";

type SupabaseCommunicationType =
  | "booking_confirmation"
  | "complimentary_booking"
  | "corporate_tentative_booking"
  | "custom_message"
  | "operational_broadcast"
  | "payment_confirmation"
  | "post_show_review"
  | "refund_notice"
  | "reservation_confirmed"
  | "reservation_pending"
  | "show_reminder";

type SupabaseCommunicationRow = {
  batch_id: string | null;
  booking_id: string | null;
  channel: SupabaseCommunicationChannel;
  created_at: string;
  customer_id: string | null;
  id: string;
  message: string;
  sent_at: string | null;
  show_id: string | null;
  status: string;
  subject: string | null;
  type: SupabaseCommunicationType;
};

type SupabaseLifecycleEventRow = {
  booking_id: string;
  changed_by: string | null;
  created_at: string;
  from_status: SupabaseBookingStatus | null;
  id: string;
  note: string | null;
  reason: string | null;
  to_status: SupabaseBookingStatus;
};

type SupabaseBookingAggregateRow = SupabaseBookingRow & {
  communication_rows?: SupabaseCommunicationRow[];
  customer_row?: {
    email: string | null;
    first_name: string | null;
    id: string;
    mobile: string | null;
    surname: string | null;
  } | null;
  lifecycle_event_rows?: SupabaseLifecycleEventRow[];
  show_row?: {
    id: string;
    notes: string | null;
  } | null;
  table_row?: {
    id: string;
    section: string | null;
    table_code: string;
  } | null;
};

const bookingMetadataPrefix = "__zingara_booking_meta__:";
const showMetadataPrefix = "__zingara_show_meta__:";

function toSupabaseBookingStatus(status: BookingStatus): SupabaseBookingStatus {
  if (status === "pending-payment" || status === "pending") {
    return "pending_payment";
  }

  if (status === "checked-in") {
    return "checked_in";
  }

  if (status === "no-show") {
    return "no_show";
  }

  return status;
}

function toDemoBookingStatus(status: SupabaseBookingStatus): BookingStatus {
  if (status === "pending_payment") {
    return "pending-payment";
  }

  if (status === "checked_in") {
    return "checked-in";
  }

  if (status === "no_show") {
    return "no-show";
  }

  return status;
}

function toSupabasePaymentStatus(status?: PaymentStatus): SupabasePaymentStatus {
  if (status === "deposit-paid") {
    return "deposit_paid";
  }

  if (status === "fully-paid") {
    return "fully_paid";
  }

  if (status === "comp-vip") {
    return "comp_vip";
  }

  if (status === "refunded") {
    return "refunded";
  }

  return "pending_payment";
}

function toDemoPaymentStatus(status: SupabasePaymentStatus): PaymentStatus {
  if (status === "deposit_paid") {
    return "deposit-paid";
  }

  if (status === "fully_paid") {
    return "fully-paid";
  }

  if (status === "comp_vip") {
    return "comp-vip";
  }

  if (status === "refunded") {
    return "refunded";
  }

  return "pending-payment";
}

function normalizeBookingSection(section?: string | null): SeatingZoneId {
  const normalized = section?.trim().toLowerCase() ?? "";

  if (isValidSeatingZoneId(normalized)) {
    return normalized;
  }

  if (
    normalized === "private booth" ||
    normalized === "private booths" ||
    normalized === "royal booth" ||
    normalized === "royal booths" ||
    normalized === "booth" ||
    normalized === "booths"
  ) {
    return "royal-booths";
  }

  if (normalized === "middle ring") {
    return "middle-ring";
  }

  if (normalized === "golden circle") {
    return "golden-circle";
  }

  if (normalized === "royal balcony") {
    return "royal-balcony";
  }

  if (normalized === "elevated stage") {
    return "elevated-stage";
  }

  return "middle-ring";
}

function getCustomerName(
  customer?: SupabaseBookingAggregateRow["customer_row"],
) {
  const fullName = [
    customer?.first_name?.trim(),
    customer?.surname?.trim(),
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  return fullName || "Imported Guest";
}

function getDemoCustomerFromCustomerRow(
  customer?: SupabaseBookingAggregateRow["customer_row"],
) {
  if (!customer) {
    return null;
  }

  return {
    email: customer.email ?? "",
    name: getCustomerName(customer),
    phone: customer.mobile ?? "",
  };
}

function toCommunicationTrigger(
  type: SupabaseCommunicationType,
): CommunicationTrigger {
  if (type === "booking_confirmation") {
    return "booking-confirmation";
  }

  if (type === "payment_confirmation") {
    return "payment-confirmation";
  }

  if (type === "reservation_confirmed") {
    return "reservation-confirmed";
  }

  if (type === "reservation_pending") {
    return "reservation-pending";
  }

  if (type === "complimentary_booking") {
    return "complimentary-booking";
  }

  if (type === "corporate_tentative_booking") {
    return "corporate-tentative-booking";
  }

  if (type === "show_reminder") {
    return "show-reminder";
  }

  if (type === "post_show_review") {
    return "post-show-review";
  }

  if (type === "refund_notice") {
    return "cancellation-refund";
  }

  if (type === "operational_broadcast") {
    return "operational-broadcast";
  }

  return "custom-message";
}

function toSupabaseType(
  trigger?: CommunicationTrigger,
): SupabaseCommunicationType {
  if (trigger === "booking-confirmation") {
    return "booking_confirmation";
  }

  if (trigger === "payment-confirmation") {
    return "payment_confirmation";
  }

  if (trigger === "reservation-confirmed") {
    return "reservation_confirmed";
  }

  if (trigger === "reservation-pending") {
    return "reservation_pending";
  }

  if (trigger === "complimentary-booking") {
    return "complimentary_booking";
  }

  if (trigger === "corporate-tentative-booking") {
    return "corporate_tentative_booking";
  }

  if (trigger === "show-reminder") {
    return "show_reminder";
  }

  if (trigger === "post-show-review") {
    return "post_show_review";
  }

  if (trigger === "cancellation-refund") {
    return "refund_notice";
  }

  if (trigger === "operational-broadcast") {
    return "operational_broadcast";
  }

  return "custom_message";
}

function toCommunicationChannel(
  channel: SupabaseCommunicationChannel,
): CommunicationChannel {
  if (channel === "whatsapp" || channel === "internal_note") {
    return "email";
  }

  return channel;
}

function toSupabaseChannel(channel: CommunicationChannel) {
  return channel;
}

function toCommunicationRecord(
  row: SupabaseCommunicationRow,
): CommunicationRecord {
  return {
    channel: toCommunicationChannel(row.channel),
    id: row.id,
    message: row.message,
    sentAt: row.sent_at ?? row.created_at,
    status:
      row.status === "failed" || row.status === "suppressed"
        ? row.status
        : "sent",
    subject: row.subject ?? undefined,
    trigger: toCommunicationTrigger(row.type),
  };
}

function toLifecycleEvent(row: SupabaseLifecycleEventRow): BookingLifecycleEvent {
  return {
    createdAt: row.created_at,
    fromStatus: row.from_status
      ? toDemoBookingStatus(row.from_status)
      : undefined,
    id: row.id,
    note: row.note ?? row.reason ?? undefined,
    toStatus: toDemoBookingStatus(row.to_status),
  };
}

function parseShowNotes(notes: string | null) {
  if (!notes?.startsWith(showMetadataPrefix)) {
    return "";
  }

  try {
    return (
      (JSON.parse(notes.slice(showMetadataPrefix.length)) as { legacyId?: string })
        .legacyId ?? ""
    );
  } catch {
    return "";
  }
}

function parseBookingNotes(notes: string | null) {
  if (!notes?.startsWith(bookingMetadataPrefix)) {
    return undefined;
  }

  try {
    return JSON.parse(notes.slice(bookingMetadataPrefix.length)) as DemoBooking;
  } catch {
    return undefined;
  }
}

function serializeBookingNotes(booking: DemoBooking) {
  return `${bookingMetadataPrefix}${JSON.stringify(booking)}`;
}

async function getShowRows() {
  const supabase = getSupabaseClient();

  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase.from("shows").select("id,date,time,notes");

  if (error) {
    console.error("[Zingara Supabase] Failed to load booking shows", error);
    return null;
  }

  return (data ?? []) as SupabaseShowRow[];
}

function getShowIdFromDateTime(date: string, time: string) {
  return `show-${date}-${time.slice(0, 5).replace(":", "")}`;
}

function getBookingDateTimeParts(booking: DemoBooking) {
  const matchedDateTime = booking.bookingDate.match(
    /(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/,
  );

  if (!matchedDateTime) {
    return undefined;
  }

  return {
    date: matchedDateTime[1],
    time: matchedDateTime[2],
  };
}

async function getSupabaseShowId(booking: DemoBooking) {
  if (!booking.showId) {
    return undefined;
  }

  const showRows = await getShowRows();
  const bookingDateTime = getBookingDateTimeParts(booking);
  const matchedShow = showRows?.find(
    (show) =>
      parseShowNotes(show.notes) === booking.showId ||
      show.id === booking.showId ||
      getShowIdFromDateTime(show.date, show.time) === booking.showId ||
      (bookingDateTime &&
        show.date === bookingDateTime.date &&
        show.time.slice(0, 5) === bookingDateTime.time),
  );

  return matchedShow?.id;
}

async function getLegacyShowId(supabaseShowId: string) {
  const showRows = await getShowRows();
  const matchedShow = showRows?.find((show) => show.id === supabaseShowId);

  return parseShowNotes(matchedShow?.notes ?? null) || supabaseShowId;
}

async function toSupabaseBooking(booking: DemoBooking) {
  const customerId = await getOrCreateCustomerIdFromInfo(booking.customer);
  const showId = await getSupabaseShowId(booking);

  console.log("[Zingara Supabase Diagnostics] Booking relation mapping", {
    bookingDate: booking.bookingDate,
    bookingReference: booking.reference,
    customerId,
    showId,
    sourceShowId: booking.showId,
  });

  if (!customerId || !showId) {
    console.log("[Zingara Supabase Diagnostics] toSupabaseBooking returned undefined", {
      bookingReference: booking.reference,
      customerId,
      showId,
    });
    console.error("[Zingara Supabase] Failed to map booking relations", {
      bookingDate: booking.bookingDate,
      bookingReference: booking.reference,
      customerId,
      showId,
      sourceShowId: booking.showId,
    });
    return undefined;
  }

  return {
    addons_total: booking.addonsTotal ?? 0,
    amount_paid: booking.amountPaid ?? 0,
    balance_outstanding: booking.balanceDue ?? 0,
    booking_reference: booking.reference,
    booking_source: booking.source ?? "online",
    booking_status: toSupabaseBookingStatus(booking.status),
    company_name:
      booking.source === "corporate-direct"
        ? booking.operationalNotes?.match(/^Company: (.+)$/m)?.[1] ?? null
        : null,
    customer_id: customerId,
    dietary_requirements:
      booking.operationalNotes?.match(/^Dietary: (.+)$/m)?.[1] ?? null,
    discount_amount: booking.discountAmount ?? 0,
    guest_count: booking.partySize,
    notes: serializeBookingNotes(booking),
    payment_status: toSupabasePaymentStatus(booking.paymentStatus),
    section: booking.zoneTitle,
    service_fee: booking.serviceFeeAmount ?? 0,
    show_id: showId,
    subtotal_amount: booking.subtotalPrice ?? booking.totalPrice,
    table_id: null,
    total_amount: booking.totalPrice,
  };
}

function mergeCommunicationHistory(
  booking: DemoBooking,
  rows: SupabaseCommunicationRow[] = [],
) {
  const supabaseCommunications = rows.map(toCommunicationRecord);

  return [
    ...supabaseCommunications,
    ...(booking.communicationHistory ?? []).filter(
      (communication) =>
        !rows.some(
          (row) =>
            row.channel === toSupabaseChannel(communication.channel) &&
            row.message === communication.message &&
            row.sent_at === communication.sentAt &&
            row.subject === (communication.subject ?? null) &&
            row.type === toSupabaseType(communication.trigger),
        ),
    ),
  ].sort(
    (left, right) =>
      new Date(right.sentAt).getTime() - new Date(left.sentAt).getTime(),
  );
}

function mergeLifecycleHistory(
  booking: DemoBooking,
  rows: SupabaseLifecycleEventRow[] = [],
) {
  const supabaseEvents = rows.map(toLifecycleEvent);

  return [
    ...supabaseEvents,
    ...(booking.lifecycleHistory ?? []).filter(
      (event) =>
        !rows.some(
          (row) =>
            row.created_at === event.createdAt &&
            row.from_status ===
              (event.fromStatus ? toSupabaseBookingStatus(event.fromStatus) : null) &&
            row.note === (event.note ?? null) &&
            row.to_status === toSupabaseBookingStatus(event.toStatus),
        ),
    ),
  ].sort(
    (left, right) =>
      new Date(right.createdAt).getTime() -
      new Date(left.createdAt).getTime(),
  );
}

async function toDemoBooking(row: SupabaseBookingAggregateRow): Promise<DemoBooking> {
  const metadataBooking = parseBookingNotes(row.notes);

  if (metadataBooking) {
    const authoritativeCustomer = getDemoCustomerFromCustomerRow(
      row.customer_row,
    );
    const authoritativeShowId =
      parseShowNotes(row.show_row?.notes ?? null) || row.show_id;
    const authoritativeZoneId = row.table_id
      ? normalizeBookingSection(row.table_row?.section ?? row.section)
      : metadataBooking.zoneId;
    const hasReleasedCancelledTable =
      row.booking_status === "cancelled" && !row.table_id;
    const authoritativeTableNumber = row.table_id
      ? row.table_row?.table_code ?? metadataBooking.tableNumber
      : hasReleasedCancelledTable
        ? "Released"
      : metadataBooking.tableNumber;
    const booking = {
      ...metadataBooking,
      amountPaid: row.amount_paid,
      customer: authoritativeCustomer ?? metadataBooking.customer,
      customerId: row.customer_id,
      archivedAt: row.archived_at ?? metadataBooking.archivedAt,
      archivedBy: row.archived_by ?? metadataBooking.archivedBy,
      archiveReason: row.archive_reason ?? metadataBooking.archiveReason,
      balanceDue: row.balance_outstanding,
      bookingOrigin: row.booking_origin ?? "legacy_unknown",
      createdByStaffId: row.created_by_staff_id ?? undefined,
      createdByStaffName: resolveStaffDisplayName(row.created_by_staff),
      partySize: row.guest_count,
      paymentStatus: toDemoPaymentStatus(row.payment_status),
      source: row.booking_source as DemoBooking["source"],
      status: toDemoBookingStatus(row.booking_status),
      supabaseBookingId: row.id,
      tableId: hasReleasedCancelledTable
        ? ""
        : row.table_id ?? metadataBooking.tableId,
      tableNumber: authoritativeTableNumber,
      totalPrice: row.total_amount,
      showId: authoritativeShowId,
      zoneId: authoritativeZoneId,
      zoneTitle: getDisplayZoneTitle(
        authoritativeZoneId,
        row.table_id ? row.section ?? metadataBooking.zoneTitle : metadataBooking.zoneTitle,
      ),
    };

    return {
      ...booking,
      communicationHistory: mergeCommunicationHistory(
        booking,
        row.communication_rows,
      ),
      lifecycleHistory: mergeLifecycleHistory(booking, row.lifecycle_event_rows),
      zoneTitle: getDisplayZoneTitle(booking.zoneId, booking.zoneTitle),
    };
  }

  const showReference = parseShowNotes(row.show_row?.notes ?? null) || row.show_id;
  const zoneId = normalizeBookingSection(row.table_row?.section ?? row.section);
  const zoneTitle = getDisplayZoneTitle(zoneId, row.section ?? undefined);
  const floorAssignmentRequired = !row.table_id;
  const tableNumber = floorAssignmentRequired
    ? "Requires floor assignment"
    : row.table_row?.table_code ?? "Assigned table";
  const booking: DemoBooking = {
    addons: [],
    addonsTotal: row.addons_total,
    customerId: row.customer_id,
    amountPaid: row.amount_paid,
    archivedAt: row.archived_at ?? undefined,
    archivedBy: row.archived_by ?? undefined,
    archiveReason: row.archive_reason ?? undefined,
    balanceDue: row.balance_outstanding,
    bookingOrigin: row.booking_origin ?? "legacy_unknown",
    bookingDate: "",
    communicationHistory: [],
    createdAt: row.created_at,
    createdByStaffId: row.created_by_staff_id ?? undefined,
    createdByStaffName: resolveStaffDisplayName(row.created_by_staff),
    customer: getDemoCustomerFromCustomerRow(row.customer_row) ?? {
      email: "",
      name: "Imported Guest",
      phone: "",
    },
    discountAmount: row.discount_amount,
    lifecycleHistory: [],
    operationalNotes: row.notes ?? "",
    partySize: row.guest_count,
    paymentStatus: toDemoPaymentStatus(row.payment_status),
    pricePerPerson:
      row.guest_count > 0 ? Math.round(row.total_amount / row.guest_count) : 0,
    reference: row.booking_reference,
    serviceFeeAmount: row.service_fee,
    showId: showReference,
    source: row.booking_source as DemoBooking["source"],
    status: toDemoBookingStatus(row.booking_status),
    supabaseBookingId: row.id,
    subtotalPrice: row.subtotal_amount,
    tableId: row.table_id ?? "requires-floor-assignment",
    tableNumber,
    ticketCode: createTicketCode(row.booking_reference),
    totalPrice: row.total_amount,
    zoneId,
    zoneTitle,
  };

  return {
    ...booking,
    communicationHistory: mergeCommunicationHistory(
      booking,
      row.communication_rows,
    ),
    lifecycleHistory: mergeLifecycleHistory(booking, row.lifecycle_event_rows),
  };
}

type GetBookingsOptions = {
  includeHistory?: boolean;
  reference?: string;
  throwOnError?: boolean;
};

async function getSupabaseBookings(options: GetBookingsOptions = {}) {
  try {
    const searchParams = new URLSearchParams();

    if (options.includeHistory === false) {
      searchParams.set("includeHistory", "0");
    }

    if (options.reference) {
      searchParams.set("reference", options.reference);
    }

    const query = searchParams.toString();
    const payload = await fetchSupabaseApi<{
      rows: SupabaseBookingAggregateRow[];
    }>(
      `/api/admin/bookings${query ? `?${query}` : ""}`,
    );

    return payload.rows ?? [];
  } catch (error) {
    console.error("[Zingara Supabase] Failed to load bookings", error);

    if (options.throwOnError) {
      throw error;
    }

    return null;
  }
}

export async function getBookings(options: GetBookingsOptions = {}) {
  const rows = await getSupabaseBookings(options);

  if (!rows) {
    return [];
  }

  return Promise.all(rows.map(toDemoBooking));
}

export async function getBooking(id: string) {
  const bookings = await getBookings({
    reference: id,
    throwOnError: true,
  });

  return bookings.find(
    (booking) => booking.reference === id || booking.ticketCode === id,
  );
}

export async function getBookingHistories() {
  const payload = await fetchSupabaseApi<{
    rows: Array<{
      booking_reference: string;
      communication_rows?: SupabaseCommunicationRow[];
      lifecycle_event_rows?: SupabaseLifecycleEventRow[];
    }>;
  }>("/api/admin/bookings?historyOnly=1");

  return new Map(
    (payload.rows ?? []).map((row) => [
      row.booking_reference,
      {
        communicationHistory: (row.communication_rows ?? []).map(
          toCommunicationRecord,
        ),
        lifecycleHistory: (row.lifecycle_event_rows ?? []).map(
          toLifecycleEvent,
        ),
      },
    ]),
  );
}

export async function getSupabaseBookingId(reference: string) {
  try {
    const payload = await fetchSupabaseApi<{ rows: SupabaseBookingRow[] }>(
      `/api/admin/bookings?reference=${encodeURIComponent(reference)}`,
    );

    return payload.rows[0]?.id;
  } catch (error) {
    console.error("[Zingara Supabase] Failed to resolve booking id", error);
    return undefined;
  }
}

export type CreateBookingResult = {
  bookingId?: string;
  customerId?: string;
  paymentId?: string;
  tableId?: string;
  tableNumber?: string;
  ticketId?: string | null;
};

export async function createBooking(booking: DemoBooking, journeyId?: string | null) {
  const result = await fetchSupabaseApi<CreateBookingResult>("/api/bookings", {
    body: { booking, journeyId },
    method: "POST",
  });

  return {
    ...booking,
    tableId: result.tableId ?? booking.tableId,
    tableNumber: result.tableNumber ?? booking.tableNumber,
  };
}

export async function createAdminBooking(
  booking: DemoBooking,
  journeyId?: string | null,
) {
  const result = await fetchSupabaseApi<CreateBookingResult>(
    "/api/admin/bookings",
    {
      body: { booking, journeyId },
      method: "POST",
    },
  );

  return {
    ...booking,
    tableId: result.tableId ?? booking.tableId,
    tableNumber: result.tableNumber ?? booking.tableNumber,
  };
}

export async function updateBooking(booking: DemoBooking) {
  await fetchSupabaseApi("/api/admin/bookings", {
    body: { action: "update-state", booking },
    method: "PATCH",
  });

  return booking;
}

export type BookingTableAssignmentResult = {
  bookingId: string;
  bookingReference: string;
  showId: string;
  tableCode: string;
  tableId: string;
};

export async function assignBookingTable(booking: DemoBooking) {
  return fetchSupabaseApi<BookingTableAssignmentResult>(
    "/api/admin/bookings",
    {
      body: {
        action: "assign-table",
        booking,
      },
      method: "PATCH",
    },
  );
}

export async function mapBookingPhysicalTable(input: {
  bookingReference: string;
  targetTableId: string;
}) {
  return fetchSupabaseApi<BookingTableAssignmentResult>(
    "/api/admin/bookings",
    {
      body: {
        action: "map-physical-table",
        ...input,
      },
      method: "PATCH",
    },
  );
}

export async function persistBookingCancellation(booking: DemoBooking) {
  let result: { idempotent?: boolean };

  try {
    result = await fetchSupabaseApi<{ idempotent?: boolean }>(
      "/api/admin/bookings",
      {
      body: {
        action: "cancel",
        booking,
      },
      method: "PATCH",
      },
    );
  } catch (error) {
    console.error("[Zingara Supabase] Failed to cancel booking", error);
    throw error;
  }

  return {
    bookings: await getBookings(),
    idempotent: Boolean(result.idempotent),
  };
}

export async function archiveBookings(
  references: string[],
  reason = "Archived by Super Admin.",
) {
  await fetchSupabaseApi("/api/admin/bookings", {
    body: {
      action: "archive",
      reason,
      references,
    },
    method: "PATCH",
  });

  return getBookings();
}

export async function restoreBookings(references: string[]) {
  await fetchSupabaseApi("/api/admin/bookings", {
    body: {
      action: "restore",
      references,
    },
    method: "PATCH",
  });

  return getBookings();
}

export async function deleteBooking(id: string) {
  try {
    await fetchSupabaseApi("/api/admin/bookings", {
      body: { reference: id },
      method: "DELETE",
    });
  } catch (error) {
    console.error("[Zingara Supabase] Failed to delete booking", error);
  }

  return getBookings();
}

export async function saveBookings(
  bookings: DemoBooking[],
  options: { createReferences?: string[] } = {},
) {
  const createReferences = new Set(options.createReferences ?? []);
  const results = await Promise.allSettled(
    bookings.map(async (booking) => {
      await fetchSupabaseApi("/api/admin/bookings", {
        body: createReferences.has(booking.reference)
          ? { booking }
          : { action: "update-state", booking },
        method: createReferences.has(booking.reference) ? "POST" : "PATCH",
      });
    }),
  );
  const failedResult = results.find(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );

  if (failedResult) {
    console.error("[Zingara Supabase] Failed to save booking", failedResult.reason);
    throw failedResult.reason;
  }

  return getBookings();
}
