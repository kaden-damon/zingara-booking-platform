import {
  type BookingStatus,
  type BookingLifecycleEvent,
  type CommunicationChannel,
  type CommunicationRecord,
  type CommunicationTrigger,
  type DemoBooking,
  type PaymentStatus,
  createTicketCode,
} from "@/lib/zingaraDemo";
import { getSupabaseClient } from "./client";
import { fetchSupabaseApi } from "./apiClient";
import { getOrCreateCustomerIdFromInfo } from "./customers";

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
  balance_outstanding: number;
  booking_reference: string;
  booking_source: string;
  booking_status: SupabaseBookingStatus;
  company_name: string | null;
  created_at: string;
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
  lifecycle_event_rows?: SupabaseLifecycleEventRow[];
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
    const booking = {
      ...metadataBooking,
      amountPaid: row.amount_paid,
      balanceDue: row.balance_outstanding,
      paymentStatus: toDemoPaymentStatus(row.payment_status),
      status: toDemoBookingStatus(row.booking_status),
      totalPrice: row.total_amount,
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

  const booking: DemoBooking = {
    addons: [],
    addonsTotal: row.addons_total,
    amountPaid: row.amount_paid,
    balanceDue: row.balance_outstanding,
    bookingDate: "",
    communicationHistory: [],
    createdAt: row.created_at,
    customer: {
      email: "",
      name: "Supabase Guest",
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
    showId: await getLegacyShowId(row.show_id),
    source: row.booking_source as DemoBooking["source"],
    status: toDemoBookingStatus(row.booking_status),
    subtotalPrice: row.subtotal_amount,
    tableId: row.table_id ?? "supabase-table",
    tableNumber: "Internal",
    ticketCode: createTicketCode(row.booking_reference),
    totalPrice: row.total_amount,
    zoneId: "middle-ring",
    zoneTitle: row.section ?? "Middle Ring",
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

async function getSupabaseBookings() {
  try {
    const payload = await fetchSupabaseApi<{
      rows: SupabaseBookingAggregateRow[];
    }>(
      "/api/admin/bookings",
    );

    return payload.rows ?? [];
  } catch (error) {
    console.error("[Zingara Supabase] Failed to load bookings", error);
    return null;
  }
}

export async function getBookings() {
  const rows = await getSupabaseBookings();

  if (!rows) {
    return [];
  }

  return Promise.all(rows.map(toDemoBooking));
}

export async function getBooking(id: string) {
  const bookings = await getBookings();

  return bookings.find(
    (booking) => booking.reference === id || booking.ticketCode === id,
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

export async function createBooking(booking: DemoBooking) {
  await fetchSupabaseApi("/api/bookings", {
    body: { booking },
    method: "POST",
  });

  return booking;
}

export async function updateBooking(booking: DemoBooking) {
  try {
    await fetchSupabaseApi("/api/admin/bookings", {
      body: { booking },
      method: "PATCH",
    });
  } catch (error) {
    console.error("[Zingara Supabase] Failed to update booking", error);
  }

  return booking;
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

export async function saveBookings(bookings: DemoBooking[]) {
  await Promise.all(
    bookings.map(async (booking) => {
      try {
        await fetchSupabaseApi("/api/admin/bookings", {
          body: { booking },
          method: "PATCH",
        });
      } catch (error) {
        console.error("[Zingara Supabase] Failed to save booking", error);
      }
    }),
  );

  return getBookings();
}
