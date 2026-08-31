import {
  type BookingLifecycleEvent,
  type BookingStatus,
  type CommunicationChannel,
  type CommunicationRecord,
  type CommunicationTrigger,
  type CustomerInfo,
  type DemoBooking,
  type DemoVenueSettings,
  type PaymentStatus,
  defaultVenueSettings,
  getDisplayZoneTitle,
  getVenueZoneSeatCapacity,
  getConfiguredZoneMaxSeats,
  normalizeVenueSettings,
  getZoneSectionLookupTitles,
  normalizeShowLocation,
  seatingZones,
  createTicketCode,
  getBookingTicketState,
  getTicketUrl,
} from "@/lib/zingaraDemo";
import { calculatePublicBookingPricing } from "@/lib/pricing";
import {
  enforceCorporateBookingSource,
  isCorporatePartySize,
} from "@/lib/bookingClassification";
import {
  resolveBookingCreationProvenance,
  resolveTrustedBookingSource,
  verifyInternalBookingHandoff,
} from "@/lib/bookingProvenance";
import {
  getFirstBookingCreateError,
  mergeCustomerContactValues,
  normalizeBookingCustomer,
  validateBookingCreate,
} from "@/lib/bookingCreateValidation";
import {
  findDuplicateSentCommunication,
  insertCommunicationPayload,
} from "@/lib/email/communicationIdempotency";
import { validatePromoCode } from "@/lib/supabase/promoCodes";
import { sendOperationalCustomerEmail } from "@/lib/email/smtp";
import {
  recordPlatformEventBestEffort,
  recordPlatformFailureEventBestEffort,
  recoverPlatformIncidentBestEffort,
} from "@/lib/platformTelemetry";
import {
  checkRateLimit,
  rateLimitResponse,
} from "@/lib/rateLimit";
import {
  getServiceClient,
  requireActiveStaff,
} from "@/lib/supabase/serverAdmin";
import { sendStaffPushNotification } from "@/lib/supabase/staffPush";
import {
  getBookingCapacityConflictResponse,
  isBookingCapacityError,
  validateBookingCapacityIncrease,
} from "@/lib/supabase/bookingCapacity";
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
  | "post_show_review"
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
  venue: string | null;
};

type BookingTableReservationClaim = {
  capacity: number;
  primary?: boolean;
  section: string;
  tableCode: string;
};

type BookingWithReservationClaims = DemoBooking & {
  reservationTableClaims?: BookingTableReservationClaim[];
};

type ReservePublicBookingResult = {
  booking_id?: string;
  claimed_table_ids?: string[];
  payment_id?: string;
  status?: "already_exists" | "conflict" | "success";
  table_code?: string;
  table_id?: string;
};

function normalizeReservationClaimSection(
  section: string | null | undefined,
  fallbackZoneTitle: string,
) {
  const rawSection = section?.trim() || fallbackZoneTitle;
  const matchedZone = seatingZones.find(
    (zone) =>
      zone.id === rawSection ||
      getZoneSectionLookupTitles(zone.id, zone.title)
        .map((title) => title.toLowerCase())
        .includes(rawSection.toLowerCase()),
  );

  return matchedZone?.id ?? rawSection;
}

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

function isAwaitingExternalPayment(booking: DemoBooking) {
  return (
    booking.status === "pending-payment" &&
    booking.paymentStatus === "pending-payment" &&
    (booking.amountPaid ?? 0) === 0
  );
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

async function ensureLifecycleEventOnce(
  supabase: SupabaseClient,
  payload: ReturnType<typeof getLifecyclePayload>,
) {
  const { error } = await supabase.rpc("ensure_booking_lifecycle_event_once", {
    p_booking_id: payload.booking_id,
    p_created_at: payload.created_at,
    p_from_status: payload.from_status,
    p_note: payload.note,
    p_to_status: payload.to_status,
  });

  if (error) {
    throw error;
  }
}

async function upsertCustomer(
  supabase: SupabaseClient,
  customer: CustomerInfo,
) {
  const payload = getCustomerPayload(customer);
  const customerKey = payload.preferences.customerKey;
  const mobile = customer.phone?.replace(/\D/g, "");

  async function loadMatchingCustomer() {
    const filters = [
      payload.email ? `email.eq.${payload.email}` : "",
      mobile ? `mobile.eq.${customer.phone.trim()}` : "",
    ]
      .filter(Boolean)
      .join(",");

    if (!filters) {
      return undefined;
    }

    const { data: rows, error: loadError } = await supabase
      .from("customers")
      .select("id,email,mobile,first_name,surname,preferences")
      .or(filters);

    if (loadError) {
      throw loadError;
    }

    return ((rows ?? []) as SupabaseCustomerRow[]).find(
      (row) =>
        row.preferences?.customerKey === customerKey ||
        (payload.email && row.email === payload.email) ||
        (mobile && row.mobile?.replace(/\D/g, "") === mobile),
    );
  }

  const existingCustomer = await loadMatchingCustomer();

  if (existingCustomer) {
    const preservedContacts = mergeCustomerContactValues(existingCustomer, {
      email: payload.email,
      mobile: payload.mobile,
    });
    const { data, error } = await supabase
      .from("customers")
      .update({
        ...payload,
        ...preservedContacts,
      })
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
    if (error.code === "23505") {
      const concurrentlyInsertedCustomer = await loadMatchingCustomer();

      if (concurrentlyInsertedCustomer) {
        const preservedContacts = mergeCustomerContactValues(
          concurrentlyInsertedCustomer,
          {
            email: payload.email,
            mobile: payload.mobile,
          },
        );
        const { data: updatedCustomer, error: updateError } = await supabase
          .from("customers")
          .update({
            ...payload,
            ...preservedContacts,
          })
          .eq("id", concurrentlyInsertedCustomer.id)
          .select("id")
          .maybeSingle();

        if (updateError) {
          throw updateError;
        }

        return (
          (updatedCustomer as { id: string } | null)?.id ??
          concurrentlyInsertedCustomer.id
        );
      }
    }

    throw error;
  }

  return (data as { id?: string } | null)?.id;
}

async function getSupabaseShowId(
  supabase: SupabaseClient,
  booking: DemoBooking,
) {
  return (await getSupabaseShowRow(supabase, booking))?.id;
}

async function getSupabaseShowRow(
  supabase: SupabaseClient,
  booking: DemoBooking,
) {
  if (!booking.showId) {
    return undefined;
  }

  const { data, error } = await supabase
    .from("shows")
    .select("id,date,time,notes,venue");

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

  return matchedShow;
}

function getBookingPayload(
  booking: DemoBooking,
  customerId: string,
  showId: string,
  tableId: string | null = null,
) {
  const bookingSource = enforceCorporateBookingSource(
    booking.partySize,
    booking.source,
  );
  const classifiedBooking = { ...booking, source: bookingSource };
  const payload: Record<string, unknown> = {
    addons_total: booking.addonsTotal ?? 0,
    amount_paid: booking.amountPaid ?? 0,
    balance_outstanding: booking.balanceDue ?? 0,
    booking_reference: booking.reference,
    booking_origin: booking.bookingOrigin ?? null,
    booking_source: bookingSource,
    booking_status: toSupabaseBookingStatus(booking.status),
    company_name:
      bookingSource === "corporate-direct"
        ? booking.operationalNotes?.match(/^Company: (.+)$/m)?.[1] ?? null
        : null,
    customer_id: customerId,
    created_by_staff_id: booking.createdByStaffId ?? null,
    dietary_requirements:
      booking.operationalNotes?.match(/^Dietary: (.+)$/m)?.[1] ?? null,
    discount_amount: booking.discountAmount ?? 0,
    guest_count: booking.partySize,
    notes: serializeBookingNotes(classifiedBooking),
    payment_status: toSupabasePaymentStatus(booking.paymentStatus),
    section: getDisplayZoneTitle(booking.zoneId, booking.zoneTitle),
    service_fee: booking.serviceFeeAmount ?? 0,
    show_id: showId,
    subtotal_amount: booking.subtotalPrice ?? booking.totalPrice,
    table_id: tableId,
    total_amount: booking.totalPrice,
    provenance_recorded_at: booking.bookingOrigin
      ? new Date().toISOString()
      : null,
  };

  if (booking.promoCodeId) {
    payload.promo_code_id = booking.promoCodeId;
    payload.promo_location = booking.promoLocation ?? null;
  }

  return payload;
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
    qr_payload: ticketCode,
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
  status: "failed" | "sent" | "suppressed" = "sent",
) {
  return {
    booking_id: bookingId,
    channel: toSupabaseCommunicationChannel(record.channel),
    customer_id: customerId,
    message: record.message,
    sent_at: record.sentAt,
    show_id: showId,
    status,
    subject: record.subject ?? null,
    type: toSupabaseCommunicationType(record.trigger),
  };
}

async function getEmailDeliveryStatus(
  record: CommunicationRecord,
  booking: DemoBooking,
  customerId: string,
) {
  if (record.channel !== "email") {
    return "sent" as const;
  }

  const result = await sendOperationalCustomerEmail({
    customerId,
    kind: "booking_confirmation",
    message: record.message,
    subject: record.subject,
    to: booking.customer.email,
  });

  if (result.ok) {
    return "sent" as const;
  }

  console.error("[Zingara API] Email communication failed", {
    bookingReference: booking.reference,
    error: result.error,
    trigger: record.trigger,
  });

  return result.suppressed ? ("suppressed" as const) : ("failed" as const);
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
    const updatePayload = { ...payload };

    // Table assignment is managed by the authoritative reservation/floor paths.
    // A general booking edit must not silently clear an existing assignment.
    delete updatePayload.table_id;
    delete updatePayload.booking_origin;
    delete updatePayload.created_by_staff_id;
    delete updatePayload.provenance_recorded_at;

    const { data, error } = await supabase
      .from("bookings")
      .update(updatePayload)
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

function normalizeReservationClaims(
  booking: BookingWithReservationClaims,
): BookingTableReservationClaim[] {
  const rawClaims = Array.isArray(booking.reservationTableClaims)
    ? booking.reservationTableClaims
    : [];
  const claims = rawClaims
    .map((claim) => ({
      capacity: Math.max(Math.trunc(Number(claim.capacity) || 0), 1),
      primary: Boolean(claim.primary),
      section: normalizeReservationClaimSection(
        claim.section,
        booking.zoneTitle,
      ),
      tableCode: claim.tableCode?.trim(),
    }))
    .filter((claim) => Boolean(claim.tableCode));
  const dedupedClaims = Array.from(
    new Map(claims.map((claim) => [claim.tableCode, claim])).values(),
  );

  if (dedupedClaims.length > 0) {
    return dedupedClaims.some((claim) => claim.primary)
      ? dedupedClaims
      : [{ ...dedupedClaims[0], primary: true }, ...dedupedClaims.slice(1)];
  }

  const tableCode = booking.tableNumber?.trim();

  return tableCode
    ? [
        {
          capacity: booking.partySize,
          primary: true,
          section: normalizeReservationClaimSection(
            booking.zoneId,
            booking.zoneTitle,
          ),
          tableCode,
        },
      ]
    : [];
}

function usesAtomicTableReservation(booking: DemoBooking) {
  return (
    (booking.source === "online" || booking.source === "corporate-direct") &&
    isAwaitingExternalPayment(booking)
  );
}

function isPromoReservationError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error && "message" in error
        ? String((error as { message?: unknown }).message ?? "")
        : String(error ?? "");

  return /promo code/i.test(message);
}

async function reservePublicBookingAtomically(
  supabase: SupabaseClient,
  booking: BookingWithReservationClaims,
  customerId: string,
  showId: string,
) {
  const claims = normalizeReservationClaims(booking);

  const primaryClaim = claims.find((claim) => claim.primary) ?? claims[0];
  const bookingForReservation =
    !primaryClaim || primaryClaim.tableCode === booking.tableNumber
      ? booking
      : {
          ...booking,
          tableId: primaryClaim.tableCode,
          tableNumber: primaryClaim.tableCode,
        };
  const bookingPayload = getBookingPayload(
    bookingForReservation,
    customerId,
    showId,
  );
  const paymentPayload = getPaymentPayload(
    bookingForReservation,
    "00000000-0000-0000-0000-000000000000",
  );
  const { data, error } = await supabase.rpc(
    claims.length > 0
      ? "reserve_public_booking_table"
      : "reserve_public_booking_entitlement",
    claims.length > 0
      ? {
          p_booking_payload: bookingPayload,
          p_payment_payload: paymentPayload,
          p_show_id: showId,
          p_table_claims: claims.map((claim) => ({
            capacity: claim.capacity,
            section: claim.section,
            table_code: claim.tableCode,
          })),
        }
      : {
          p_booking_payload: bookingPayload,
          p_payment_payload: paymentPayload,
          p_show_id: showId,
        },
  );

  if (error) {
    throw error;
  }

  const result = data as ReservePublicBookingResult | null;

  if (result?.status === "conflict") {
    return {
      error: Response.json(
        {
          error:
            "That table has just been reserved by another guest. We're refreshing the available seating for you.",
          tableCode: result.table_code,
        },
        { status: 409 },
      ),
    };
  }

  if (result?.status !== "success" && result?.status !== "already_exists") {
    return {
      error: Response.json(
        { error: "Booking reservation could not be completed." },
        { status: 409 },
      ),
    };
  }

  return {
    bookingId: result.booking_id,
    paymentId: result.payment_id,
    tableId: result.table_id,
    tableNumber: primaryClaim?.tableCode,
  };
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

  for (const event of booking.lifecycleHistory ?? []) {
    await ensureLifecycleEventOnce(
      supabase,
      getLifecyclePayload(event, bookingId),
    );
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

  for (const record of booking.communicationHistory ?? []) {
    const basePayload = getCommunicationPayload(
      record,
      bookingId,
      customerId,
      showId,
    );
    const duplicateRow = await findDuplicateSentCommunication(supabase, {
      ...basePayload,
      status: "sent",
    });

    if (duplicateRow) {
      continue;
    }

    await insertCommunicationPayload(supabase, {
      ...basePayload,
      status: await getEmailDeliveryStatus(record, booking, customerId),
    });
  }
}

async function loadVenueSettings(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("venue_settings")
    .select("settings")
    .eq("venue_key", defaultVenueSettings.venueId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return normalizeVenueSettings(
    (data as { settings?: DemoVenueSettings | null } | null)?.settings,
  );
}

async function getRemainingSeatsForServerPricing(
  supabase: SupabaseClient,
  showId: string,
  booking: DemoBooking,
  settings: DemoVenueSettings,
) {
  const zone = seatingZones.find((candidate) => candidate.id === booking.zoneId);

  if (!zone) {
    throw new Error("Unknown seating zone.");
  }

  const { data, error } = await supabase
    .from("bookings")
    .select("guest_count")
    .eq("show_id", showId)
    .in("section", getZoneSectionLookupTitles(zone.id, booking.zoneTitle))
    .is("archived_at", null)
    .in("booking_status", [
      "new",
      "confirmed",
      "pending_payment",
      "checked_in",
    ]);

  if (error) {
    throw error;
  }

  const occupiedSeats = (data ?? []).reduce(
    (total, row) => total + Math.max(Number(row.guest_count) || 0, 0),
    0,
  );

  return Math.max(
    getConfiguredZoneMaxSeats(settings, zone) - occupiedSeats,
    0,
  );
}

async function withAuthoritativePublicPricing(
  supabase: SupabaseClient,
  booking: DemoBooking,
  show: SupabaseShowRow,
): Promise<DemoBooking> {
  const zone = seatingZones.find((candidate) => candidate.id === booking.zoneId);

  if (!zone) {
    throw new Error("Unknown seating zone.");
  }

  const settings = await loadVenueSettings(supabase);
  const remainingSeats = await getRemainingSeatsForServerPricing(
    supabase,
    show.id,
    booking,
    settings,
  );
  const preliminaryPricing = calculatePublicBookingPricing({
    addons: booking.addons,
    partySize: booking.partySize,
    paymentOption: booking.paymentOption,
    remainingSeats,
    settings,
    zoneId: booking.zoneId,
  });
  const location = normalizeShowLocation(show.venue);
  const promo = await validatePromoCode(supabase, {
    code: booking.promoCode,
    location,
    showId: show.id,
    subtotal: preliminaryPricing.subtotal,
  });
  const pricing = calculatePublicBookingPricing({
    addons: booking.addons,
    partySize: booking.partySize,
    paymentOption: booking.paymentOption,
    promo: promo.status === "valid" ? promo : null,
    remainingSeats,
    settings,
    zoneId: booking.zoneId,
  });
  const lifecycleHistory = (booking.lifecycleHistory ?? []).map((event) => ({
    ...event,
    note:
      event.note === "Online booking created"
        ? "Online booking created with server-authoritative pricing"
        : event.note,
  }));

  return {
    ...booking,
    addons: pricing.addons,
    addonsTotal: pricing.addonsTotal,
    balanceDue: pricing.total,
    depositPercentage: pricing.depositPercentage,
    discountAmount: pricing.discountAmount,
    lifecycleHistory,
    paymentOption: booking.paymentOption === "deposit" ? "deposit" : "full",
    pricePerPerson: pricing.pricePerPerson,
    promoCode: promo.status === "valid" ? promo.code : undefined,
    promoCodeId: promo.status === "valid" ? promo.promoCodeId : undefined,
    promoLabel: promo.status === "valid" ? promo.description : undefined,
    promoLocation: location ?? undefined,
    serviceFeeAmount: pricing.serviceFeeAmount,
    subtotalPrice: pricing.subtotal,
    totalPrice: pricing.total,
  };
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  const supabase = getServiceClient();

  if (!supabase) {
    return Response.json(
      { error: "Booking is temporarily unavailable. Please try again shortly." },
      { status: 503 },
    );
  }

  try {
    const rawBody = await request.text();
    const body = JSON.parse(rawBody) as {
      booking?: DemoBooking;
      journeyId?: string | null;
    };
    let booking = body.booking;
    const journeyId =
      typeof body.journeyId === "string" ? body.journeyId : null;

    if (!booking?.reference || !booking.customer || !booking.showId) {
      return Response.json(
        { error: "A valid booking payload is required." },
        { status: 400 },
      );
    }

    const handoffSignature = request.headers.get(
      "x-zingara-booking-handoff-signature",
    );
    const handoffStaffProfileId = request.headers.get(
      "x-zingara-booking-handoff-staff",
    );
    const handoffTimestamp = request.headers.get(
      "x-zingara-booking-handoff-timestamp",
    );
    const handoffSecret = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
    const hasInternalHandoff = Boolean(
      handoffSignature || handoffStaffProfileId || handoffTimestamp,
    );
    const isTrustedInternalHandoff = Boolean(
      handoffSecret &&
        handoffSignature &&
        handoffStaffProfileId &&
        handoffTimestamp &&
        verifyInternalBookingHandoff({
          body: rawBody,
          secret: handoffSecret,
          signature: handoffSignature,
          staffProfileId: handoffStaffProfileId,
          timestamp: handoffTimestamp,
        }),
    );

    if (hasInternalHandoff && !isTrustedInternalHandoff) {
      return Response.json(
        { error: "Invalid internal booking creation context." },
        { status: 401 },
      );
    }

    let staffProfileId: string | null = null;

    if (isTrustedInternalHandoff) {
      const staffAuth = await requireActiveStaff(request);

      if (
        staffAuth.error ||
        !staffAuth.staffProfile ||
        staffAuth.staffProfile.id !== handoffStaffProfileId
      ) {
        return staffAuth.error ?? Response.json(
          { error: "Invalid internal booking staff context." },
          { status: 403 },
        );
      }

      staffProfileId = staffAuth.staffProfile.id;
    }
    const trustedBookingSource = resolveTrustedBookingSource({
      requestedSource: booking.source,
      staffProfileId,
    });
    const provenance = resolveBookingCreationProvenance({
      bookingSource: trustedBookingSource,
      staffProfileId,
    });
    booking = {
      ...booking,
      bookingOrigin: provenance.bookingOrigin,
      createdByStaffId: provenance.createdByStaffId,
      customer: normalizeBookingCustomer(booking.customer),
      source: trustedBookingSource,
    };

    const isTrustedStaff = Boolean(staffProfileId);
    let isCreate = true;

    if (isTrustedStaff) {
      const { data: existingBooking, error: existingBookingError } =
        await supabase
          .from("bookings")
          .select("id")
          .eq("booking_reference", booking.reference)
          .maybeSingle();

      if (existingBookingError) {
        throw existingBookingError;
      }

      isCreate = !existingBooking;
    }

    const createValidationErrors = validateBookingCreate({
      bookingSource: trustedBookingSource,
      customer: booking.customer,
      isCreate,
      isTrustedStaff,
      partySize: booking.partySize,
    });
    const createValidationError = getFirstBookingCreateError(
      createValidationErrors,
    );

    if (createValidationError) {
      return Response.json(
        {
          error: createValidationError,
          fieldErrors: createValidationErrors,
        },
        { status: 400 },
      );
    }

    if (booking.source === "online" && isCorporatePartySize(booking.partySize)) {
      return Response.json(
        {
          corporateUrl: `/corporate?guests=${Math.trunc(booking.partySize)}`,
          error:
            "Parties of 20 or more are handled through Corporate Bookings.",
        },
        { status: 409 },
      );
    }

    const ipLimit = await checkRateLimit(
      request,
      {
        limit: 45,
        scope: "public_booking_create_ip",
        windowSeconds: 60,
      },
      [booking.showId],
      supabase,
    );

    if (!ipLimit.allowed) {
      return rateLimitResponse(
        ipLimit.retryAfterSeconds,
        {
          bookingReference: booking.reference,
          journeyId,
          metadata: {
            section: booking.zoneTitle,
            source: "online",
          },
          operation: "create_booking",
          route: "/api/bookings",
          safeFingerprint: "booking_create_rate_limited_ip",
        },
        supabase,
      );
    }

    const referenceLimit = await checkRateLimit(
      request,
      {
        limit: 3,
        scope: "public_booking_create_reference",
        windowSeconds: 300,
      },
      [booking.reference],
      supabase,
    );

    if (!referenceLimit.allowed) {
      return rateLimitResponse(
        referenceLimit.retryAfterSeconds,
        {
          bookingReference: booking.reference,
          journeyId,
          metadata: {
            section: booking.zoneTitle,
            source: "online",
          },
          operation: "create_booking",
          route: "/api/bookings",
          safeFingerprint: "booking_create_rate_limited_reference",
        },
        supabase,
      );
    }

    const customerId = await upsertCustomer(supabase, booking.customer);
    const show = await getSupabaseShowRow(supabase, booking);
    const showId = show?.id;

    if (!customerId || !show) {
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

    if (booking.source === "online" && isAwaitingExternalPayment(booking)) {
      booking = await withAuthoritativePublicPricing(supabase, booking, show);
    }

    const capacityResult = await validateBookingCapacityIncrease(supabase, {
      bookingReference: booking.reference,
      bookingStatus: toSupabaseBookingStatus(booking.status),
      guestCount: booking.partySize,
      section: getDisplayZoneTitle(booking.zoneId, booking.zoneTitle),
      showId: show.id,
    });

    if (!capacityResult.allowed) {
      return getBookingCapacityConflictResponse(capacityResult);
    }

    if (usesAtomicTableReservation(booking)) {
      const reservation = await reservePublicBookingAtomically(
        supabase,
        booking as BookingWithReservationClaims,
        customerId,
        show.id,
      );

      if (reservation.error) {
        return reservation.error;
      }

      if (reservation.bookingId) {
        await syncLifecycleEvents(supabase, booking, reservation.bookingId);
      }

      recordPlatformEventBestEffort(
        {
          bookingReference: booking.reference,
          durationMs: Date.now() - startedAt,
          eventType: "booking_reserved",
          journeyId,
          metadata: {
            section: booking.zoneTitle,
            source: "online",
          },
          operation: "reserve_public_booking_table",
          route: "/api/bookings",
          statusCode: 200,
        },
        supabase,
      );
      recoverPlatformIncidentBestEffort(
        {
          fingerprint: "booking_create_unavailable",
          service: "BOOKING API",
          summary: "Public booking creation recovered.",
        },
        supabase,
      );

      return Response.json({
        bookingId: reservation.bookingId,
        customerId,
        paymentId: reservation.paymentId,
        tableId: reservation.tableId,
        tableNumber: reservation.tableNumber,
        ticketId: null,
      });
    }

    const bookingId = await upsertBooking(supabase, booking, customerId, show.id);

    if (!bookingId) {
      recordPlatformFailureEventBestEffort(
        {
          bookingReference: booking.reference,
          journeyId,
          metadata: {
            section: booking.zoneTitle,
            source: "online",
          },
          operation: "create_booking",
          route: "/api/bookings",
          safeFingerprint: "booking_create_unavailable",
          service: "BOOKING API",
          statusCode: 500,
          summary: "Public booking creation failures are recurring.",
        },
        supabase,
      );
      return Response.json(
        { error: "Booking could not be created." },
        { status: 500 },
      );
    }

    const paymentId = await upsertPayment(supabase, booking, bookingId);
    const ticketId = isAwaitingExternalPayment(booking)
      ? null
      : await upsertTicket(supabase, booking, bookingId);

    await syncLifecycleEvents(supabase, booking, bookingId);
    if (!isAwaitingExternalPayment(booking)) {
      await syncCommunications(supabase, booking, bookingId, customerId, show.id);
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
    }
    recoverPlatformIncidentBestEffort(
      {
        fingerprint: "booking_create_unavailable",
        service: "BOOKING API",
        summary: "Public booking creation recovered.",
      },
      supabase,
    );

    return Response.json({
      bookingId,
      customerId,
      paymentId,
      ticketId,
    });
  } catch (error) {
    if (isBookingCapacityError(error)) {
      return Response.json(
        {
          error:
            "This seating zone cannot accept additional guests because its venue capacity has been reached.",
        },
        { status: 409 },
      );
    }

    if (isPromoReservationError(error)) {
      return Response.json(
        {
          error:
            "That promo code is no longer available for this booking. Please refresh your payment summary and try again.",
        },
        { status: 409 },
      );
    }

    console.error("[Zingara API] Booking transaction failed", error);
    recordPlatformFailureEventBestEffort(
      {
        operation: "create_booking",
        route: "/api/bookings",
        safeFingerprint: "booking_create_unavailable",
        service: "BOOKING API",
        statusCode: 500,
        summary: "Public booking creation failures are recurring.",
      },
      supabase,
    );

    return Response.json(
      { error: "Booking transaction failed." },
      { status: 500 },
    );
  }
}
