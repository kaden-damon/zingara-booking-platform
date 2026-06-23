import {
  type BookingLifecycleEvent,
  type BookingStatus,
  type CommunicationChannel,
  type CommunicationRecord,
  type CommunicationTrigger,
  type CustomerInfo,
  type DemoBooking,
  type PaymentStatus,
  createTicketCode,
  getBookingTicketState,
  getTicketUrl,
} from "@/lib/zingaraDemo";
import { getServiceClient } from "@/lib/supabase/serverAdmin";
import { sendStaffPushNotification } from "@/lib/supabase/staffPush";
import type { SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

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

type SupabasePaymentStatus =
  | "cancelled"
  | "comp_vip"
  | "deposit_paid"
  | "fully_paid"
  | "pending_payment"
  | "refunded";

type SupabasePaymentType =
  | "adjustment"
  | "balance"
  | "comp"
  | "deposit"
  | "full_payment"
  | "refund";

type SupabaseTicketStatus =
  | "cancelled"
  | "checked_in"
  | "expired"
  | "issued"
  | "refunded"
  | "valid"
  | "void";

type CustomerPreferences = {
  customerKey?: string;
  vipTags?: string[];
};

type SupabaseCustomerRow = {
  email: string | null;
  first_name: string;
  id: string;
  mobile: string | null;
  preferences: CustomerPreferences | null;
  surname: string | null;
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

function toSupabaseCommunicationType(
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

function toSupabaseCommunicationChannel(
  channel: CommunicationChannel,
): SupabaseCommunicationChannel {
  return channel;
}

function toSupabaseTicketStatus(booking: DemoBooking): SupabaseTicketStatus {
  const state = getBookingTicketState(booking);

  if (state === "Cancelled") {
    return "cancelled";
  }

  if (state === "Checked In") {
    return "checked_in";
  }

  if (state === "Refunded") {
    return "refunded";
  }

  if (state === "Active" || state === "Completed") {
    return "valid";
  }

  return "issued";
}

function getPaymentType(booking: DemoBooking): SupabasePaymentType {
  if (booking.paymentStatus === "refunded" || booking.status === "refunded") {
    return "refund";
  }

  if (booking.paymentStatus === "comp-vip") {
    return "comp";
  }

  if (booking.paymentStatus === "deposit-paid") {
    return "deposit";
  }

  if (booking.paymentStatus === "fully-paid") {
    return "full_payment";
  }

  return booking.paymentOption === "deposit" ? "deposit" : "full_payment";
}

function getPaymentAmount(booking: DemoBooking) {
  if (
    booking.paymentStatus === "refunded" ||
    booking.status === "refunded" ||
    booking.paymentStatus === "comp-vip"
  ) {
    return 0;
  }

  return booking.amountPaid ?? 0;
}

function getCustomerKey(customer: CustomerInfo) {
  const email = customer.email?.trim().toLowerCase();
  const phone = customer.phone?.replace(/\D/g, "");
  const name = customer.name?.trim().toLowerCase();

  return email || phone || name || "unknown-customer";
}

function splitCustomerName(name: string | undefined, fallbackKey: string) {
  const trimmedName = name?.trim() || fallbackKey;
  const [firstName = trimmedName, ...surnameParts] = trimmedName.split(/\s+/);

  return {
    firstName,
    surname: surnameParts.join(" ") || null,
  };
}

function getCustomerPayload(customer: CustomerInfo) {
  const customerKey = getCustomerKey(customer);
  const nameParts = splitCustomerName(customer.name, customerKey);

  return {
    dietary_requirements: null,
    email: customer.email?.trim().toLowerCase() || null,
    first_name: nameParts.firstName,
    mobile: customer.phone?.trim() || null,
    preferences: {
      customerKey,
      vipTags: [],
    },
    relationship_notes: "",
    surname: nameParts.surname,
    vip_status: null,
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

function serializeBookingNotes(booking: DemoBooking) {
  return `${bookingMetadataPrefix}${JSON.stringify(booking)}`;
}

function isSameCommunication(
  row: {
    booking_id: string | null;
    channel: SupabaseCommunicationChannel;
    customer_id: string | null;
    message: string;
    sent_at: string | null;
    subject: string | null;
    type: SupabaseCommunicationType;
  },
  payload: ReturnType<typeof getCommunicationPayload>,
) {
  return (
    row.booking_id === payload.booking_id &&
    row.channel === payload.channel &&
    row.customer_id === payload.customer_id &&
    row.message === payload.message &&
    row.sent_at === payload.sent_at &&
    row.subject === payload.subject &&
    row.type === payload.type
  );
}

function isSameLifecycleEvent(
  row: {
    booking_id: string;
    created_at: string;
    from_status: SupabaseBookingStatus | null;
    note: string | null;
    to_status: SupabaseBookingStatus;
  },
  payload: ReturnType<typeof getLifecyclePayload>,
) {
  return (
    row.booking_id === payload.booking_id &&
    row.created_at === payload.created_at &&
    row.from_status === payload.from_status &&
    row.note === payload.note &&
    row.to_status === payload.to_status
  );
}

async function upsertCustomer(
  supabase: SupabaseClient,
  customer: CustomerInfo,
) {
  const payload = getCustomerPayload(customer);
  const customerKey = payload.preferences.customerKey;
  const mobile = customer.phone?.replace(/\D/g, "");

  const { data: rows, error: loadError } = await supabase
    .from("customers")
    .select("id,email,mobile,first_name,surname,preferences")
    .or(
      [
        payload.email ? `email.eq.${payload.email}` : "",
        mobile ? `mobile.eq.${customer.phone.trim()}` : "",
      ]
        .filter(Boolean)
        .join(","),
    );

  if (loadError) {
    throw loadError;
  }

  const existingCustomer = ((rows ?? []) as SupabaseCustomerRow[]).find(
    (row) =>
      row.preferences?.customerKey === customerKey ||
      (payload.email && row.email === payload.email) ||
      (mobile && row.mobile?.replace(/\D/g, "") === mobile),
  );

  if (existingCustomer) {
    const { data, error } = await supabase
      .from("customers")
      .update(payload)
      .eq("id", existingCustomer.id)
      .select("id")
      .maybeSingle();

    if (error) {
      throw error;
    }

    return (data as { id: string } | null)?.id ?? existingCustomer.id;
  }

  const { data, error } = await supabase
    .from("customers")
    .insert(payload)
    .select("id")
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as { id?: string } | null)?.id;
}

async function getSupabaseShowId(
  supabase: SupabaseClient,
  booking: DemoBooking,
) {
  if (!booking.showId) {
    return undefined;
  }

  const { data, error } = await supabase.from("shows").select("id,date,time,notes");

  if (error) {
    throw error;
  }

  const showRows = (data ?? []) as SupabaseShowRow[];
  const bookingDateTime = getBookingDateTimeParts(booking);
  const matchedShow = showRows.find(
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

function getBookingPayload(
  booking: DemoBooking,
  customerId: string,
  showId: string,
) {
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

function getPaymentPayload(booking: DemoBooking, bookingId: string) {
  return {
    amount: getPaymentAmount(booking),
    booking_id: bookingId,
    method: "platform",
    notes: booking.refundNotes || booking.paymentOption || null,
    payment_status: toSupabasePaymentStatus(booking.paymentStatus),
    payment_type: getPaymentType(booking),
    processed_at: new Date().toISOString(),
    reference: booking.reference,
  };
}

function getTicketPayload(booking: DemoBooking, bookingId: string) {
  const ticketCode = booking.ticketCode ?? createTicketCode(booking.reference);

  return {
    booking_id: bookingId,
    issued_at: booking.ticketIssuedAt ?? booking.createdAt,
    qr_payload: getTicketUrl(booking.reference),
    ticket_code: ticketCode,
    ticket_status: toSupabaseTicketStatus(booking),
    ticket_url: getTicketUrl(booking.reference),
  };
}

function getLifecyclePayload(
  event: BookingLifecycleEvent,
  bookingId: string,
) {
  return {
    booking_id: bookingId,
    created_at: event.createdAt,
    from_status: event.fromStatus
      ? toSupabaseBookingStatus(event.fromStatus)
      : null,
    note: event.note ?? null,
    reason: null,
    to_status: toSupabaseBookingStatus(event.toStatus),
  };
}

function getCommunicationPayload(
  record: CommunicationRecord,
  bookingId: string,
  customerId: string,
  showId: string,
) {
  return {
    booking_id: bookingId,
    channel: toSupabaseCommunicationChannel(record.channel),
    customer_id: customerId,
    message: record.message,
    sent_at: record.sentAt,
    show_id: showId,
    status: "sent",
    subject: record.subject ?? null,
    type: toSupabaseCommunicationType(record.trigger),
  };
}

async function upsertBooking(
  supabase: SupabaseClient,
  booking: DemoBooking,
  customerId: string,
  showId: string,
) {
  const payload = getBookingPayload(booking, customerId, showId);
  const { data: existingRows, error: loadError } = await supabase
    .from("bookings")
    .select("id")
    .eq("booking_reference", booking.reference)
    .limit(1);

  if (loadError) {
    throw loadError;
  }

  const existingId = (existingRows?.[0] as { id?: string } | undefined)?.id;

  if (existingId) {
    const { data, error } = await supabase
      .from("bookings")
      .update(payload)
      .eq("id", existingId)
      .select("id")
      .maybeSingle();

    if (error) {
      throw error;
    }

    return (data as { id: string } | null)?.id ?? existingId;
  }

  const { data, error } = await supabase
    .from("bookings")
    .insert(payload)
    .select("id")
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as { id?: string } | null)?.id;
}

async function upsertPayment(
  supabase: SupabaseClient,
  booking: DemoBooking,
  bookingId: string,
) {
  const payload = getPaymentPayload(booking, bookingId);
  const { data: existingRows, error: loadError } = await supabase
    .from("payments")
    .select("id")
    .eq("reference", booking.reference)
    .limit(1);

  if (loadError) {
    throw loadError;
  }

  const existingId = (existingRows?.[0] as { id?: string } | undefined)?.id;

  if (existingId) {
    const { error } = await supabase
      .from("payments")
      .update(payload)
      .eq("id", existingId);

    if (error) {
      throw error;
    }

    return existingId;
  }

  const { data, error } = await supabase
    .from("payments")
    .insert(payload)
    .select("id")
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as { id?: string } | null)?.id;
}

async function upsertTicket(
  supabase: SupabaseClient,
  booking: DemoBooking,
  bookingId: string,
) {
  const payload = getTicketPayload(booking, bookingId);
  const { data: existingRows, error: loadError } = await supabase
    .from("tickets")
    .select("id")
    .eq("ticket_code", payload.ticket_code)
    .limit(1);

  if (loadError) {
    throw loadError;
  }

  const existingId = (existingRows?.[0] as { id?: string } | undefined)?.id;

  if (existingId) {
    const { error } = await supabase
      .from("tickets")
      .update(payload)
      .eq("id", existingId);

    if (error) {
      throw error;
    }

    return existingId;
  }

  const { data, error } = await supabase
    .from("tickets")
    .insert(payload)
    .select("id")
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as { id?: string } | null)?.id;
}

async function syncLifecycleEvents(
  supabase: SupabaseClient,
  booking: DemoBooking,
  bookingId: string,
) {
  if ((booking.lifecycleHistory ?? []).length === 0) {
    return;
  }

  const { data: rows, error: loadError } = await supabase
    .from("booking_lifecycle_events")
    .select("booking_id,created_at,from_status,note,to_status")
    .eq("booking_id", bookingId);

  if (loadError) {
    throw loadError;
  }

  const existingRows = (rows ?? []) as Array<{
    booking_id: string;
    created_at: string;
    from_status: SupabaseBookingStatus | null;
    note: string | null;
    to_status: SupabaseBookingStatus;
  }>;
  const payloads = (booking.lifecycleHistory ?? [])
    .map((event) => getLifecyclePayload(event, bookingId))
    .filter(
      (payload) => !existingRows.some((row) => isSameLifecycleEvent(row, payload)),
    );

  if (payloads.length === 0) {
    return;
  }

  const { error } = await supabase
    .from("booking_lifecycle_events")
    .insert(payloads);

  if (error) {
    throw error;
  }
}

async function syncCommunications(
  supabase: SupabaseClient,
  booking: DemoBooking,
  bookingId: string,
  customerId: string,
  showId: string,
) {
  if ((booking.communicationHistory ?? []).length === 0) {
    return;
  }

  const { data: rows, error: loadError } = await supabase
    .from("communications")
    .select("booking_id,channel,customer_id,message,sent_at,subject,type")
    .eq("booking_id", bookingId);

  if (loadError) {
    throw loadError;
  }

  const existingRows = (rows ?? []) as Array<{
    booking_id: string | null;
    channel: SupabaseCommunicationChannel;
    customer_id: string | null;
    message: string;
    sent_at: string | null;
    subject: string | null;
    type: SupabaseCommunicationType;
  }>;
  const payloads = (booking.communicationHistory ?? [])
    .map((record) => getCommunicationPayload(record, bookingId, customerId, showId))
    .filter(
      (payload) => !existingRows.some((row) => isSameCommunication(row, payload)),
    );

  if (payloads.length === 0) {
    return;
  }

  const { error } = await supabase.from("communications").insert(payloads);

  if (error) {
    throw error;
  }
}

export async function POST(request: Request) {
  const supabase = getServiceClient();

  if (!supabase) {
    return Response.json(
      { error: "Supabase service role is not configured." },
      { status: 500 },
    );
  }

  try {
    const body = (await request.json()) as { booking?: DemoBooking };
    const booking = body.booking;

    if (!booking?.reference || !booking.customer || !booking.showId) {
      return Response.json(
        { error: "A valid booking payload is required." },
        { status: 400 },
      );
    }

    const customerId = await upsertCustomer(supabase, booking.customer);
    const showId = await getSupabaseShowId(supabase, booking);

    if (!customerId || !showId) {
      console.error("[Zingara API] Failed to map booking relations", {
        bookingDate: booking.bookingDate,
        bookingReference: booking.reference,
        customerId,
        showId,
        sourceShowId: booking.showId,
      });

      return Response.json(
        { error: "Booking customer or show could not be resolved." },
        { status: 400 },
      );
    }

    const bookingId = await upsertBooking(supabase, booking, customerId, showId);

    if (!bookingId) {
      return Response.json(
        { error: "Booking could not be created." },
        { status: 500 },
      );
    }

    const paymentId = await upsertPayment(supabase, booking, bookingId);
    const ticketId = await upsertTicket(supabase, booking, bookingId);

    await syncLifecycleEvents(supabase, booking, bookingId);
    await syncCommunications(supabase, booking, bookingId, customerId, showId);
    console.info("[Zingara push diagnostics] New booking trigger queued", {
      bookingReference: booking.reference,
    });
    void sendStaffPushNotification({
      bookingReference: booking.reference,
      trigger: "new-booking",
    }).then((result) => {
      console.info("[Zingara push diagnostics] New booking trigger completed", {
        bookingReference: booking.reference,
        result,
      });
    });

    return Response.json({
      bookingId,
      customerId,
      paymentId,
      ticketId,
    });
  } catch (error) {
    console.error("[Zingara API] Booking transaction failed", error);

    return Response.json(
      { error: "Booking transaction failed." },
      { status: 500 },
    );
  }
}
