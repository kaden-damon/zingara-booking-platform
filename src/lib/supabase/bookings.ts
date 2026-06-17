import {
  type BookingStatus,
  type DemoBooking,
  type PaymentStatus,
  createTicketCode,
  getStoredDemoBookings,
  storeDemoBookings,
} from "@/lib/zingaraDemo";
import { getSupabaseClient } from "./client";
import {
  getCommunicationsForBooking,
  syncBookingCommunications,
} from "./communications";
import { getOrCreateCustomerIdFromInfo } from "./customers";
import {
  getLifecycleEventsForBooking,
  syncBookingLifecycleEvents,
} from "./lifecycleEvents";

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

async function toDemoBooking(row: SupabaseBookingRow): Promise<DemoBooking> {
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
      communicationHistory: await getCommunicationsForBooking(booking),
      lifecycleHistory: await getLifecycleEventsForBooking(booking),
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
    communicationHistory: await getCommunicationsForBooking(booking),
    lifecycleHistory: await getLifecycleEventsForBooking(booking),
  };
}

async function getSupabaseBookings() {
  const supabase = getSupabaseClient();

  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("bookings")
    .select(
      "id,customer_id,show_id,table_id,booking_reference,booking_source,company_name,guest_count,booking_status,payment_status,section,service_fee,subtotal_amount,discount_amount,addons_total,total_amount,amount_paid,balance_outstanding,notes,dietary_requirements,created_at,updated_at",
    )
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[Zingara Supabase] Failed to load bookings", error);
    return null;
  }

  return (data ?? []) as SupabaseBookingRow[];
}

async function persistBookingsToSupabase(bookings: DemoBooking[]) {
  const supabase = getSupabaseClient();

  if (!supabase) {
    return bookings;
  }

  const existingRows = (await getSupabaseBookings()) ?? [];

  await Promise.all(
    bookings.map(async (booking) => {
      const payload = await toSupabaseBooking(booking);

      if (!payload) {
        return;
      }

      const existingRow = existingRows.find(
        (row) => row.booking_reference === booking.reference,
      );

      if (existingRow) {
        const { error } = await supabase
          .from("bookings")
          .update(payload)
          .eq("id", existingRow.id);

        if (error) {
          console.error("[Zingara Supabase] Failed to update booking", error);
        }

        await syncBookingCommunications(booking);
        await syncBookingLifecycleEvents(booking);

        return;
      }

      console.log("[Zingara Supabase Diagnostics] Creating booking row", {
        bookingReference: booking.reference,
        customerId: payload.customer_id,
        payload,
        showId: payload.show_id,
      });

      const { error } = await supabase.from("bookings").insert(payload);

      if (error) {
        console.error("[Zingara Supabase Diagnostics] Full booking insert error", {
          bookingReference: booking.reference,
          error,
          payload,
        });
        console.error("[Zingara Supabase] Failed to create booking", error);
        return;
      }

      await syncBookingCommunications(booking);
      await syncBookingLifecycleEvents(booking);
    }),
  );

  return bookings;
}

export async function getBookings() {
  const fallbackBookings = getStoredDemoBookings();
  const rows = await getSupabaseBookings();

  if (!rows) {
    return fallbackBookings;
  }

  if (rows.length === 0) {
    await persistBookingsToSupabase(fallbackBookings);

    return fallbackBookings;
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
  const supabase = getSupabaseClient();

  if (!supabase) {
    return undefined;
  }

  const { data, error } = await supabase
    .from("bookings")
    .select("id")
    .eq("booking_reference", reference)
    .maybeSingle();

  if (error) {
    console.error("[Zingara Supabase] Failed to resolve booking id", error);
    return undefined;
  }

  return (data as { id?: string } | null)?.id;
}

export async function createBooking(booking: DemoBooking) {
  const nextBookings = [booking, ...getStoredDemoBookings()];

  storeDemoBookings(nextBookings);
  await persistBookingsToSupabase(nextBookings);

  return booking;
}

export async function updateBooking(booking: DemoBooking) {
  const nextBookings = getStoredDemoBookings().map((currentBooking) =>
    currentBooking.reference === booking.reference ? booking : currentBooking,
  );

  storeDemoBookings(nextBookings);
  await persistBookingsToSupabase(nextBookings);

  return booking;
}

export async function deleteBooking(id: string) {
  const supabase = getSupabaseClient();
  const nextBookings = getStoredDemoBookings().filter(
    (booking) => booking.reference !== id,
  );

  storeDemoBookings(nextBookings);

  if (supabase) {
    const { error } = await supabase
      .from("bookings")
      .delete()
      .eq("booking_reference", id);

    if (error) {
      console.error("[Zingara Supabase] Failed to delete booking", error);
    }
  }

  return nextBookings;
}

export async function saveBookings(bookings: DemoBooking[]) {
  storeDemoBookings(bookings);
  await persistBookingsToSupabase(bookings);

  return getBookings();
}
