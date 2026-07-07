import {
  type CommunicationChannel,
  type CommunicationRecord,
  type CommunicationTrigger,
  type CorporateRequest,
  type DemoBooking,
} from "@/lib/zingaraDemo";
import { getSupabaseClient } from "./client";
import { fetchSupabaseApi } from "./apiClient";
import { getOrCreateCustomerIdFromInfo } from "./customers";

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

type SupabaseBookingRelationRow = {
  customer_id: string;
  id: string;
  show_id: string;
};

type CommunicationContext = {
  booking?: DemoBooking;
  corporateRequest?: CorporateRequest;
};

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

function toSupabaseChannel(
  channel: CommunicationChannel,
): SupabaseCommunicationChannel {
  return channel;
}

function toCommunicationChannel(
  channel: SupabaseCommunicationChannel,
): CommunicationChannel {
  if (channel === "whatsapp" || channel === "internal_note") {
    return "email";
  }

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

async function getBookingRelation(reference: string) {
  try {
    const payload = await fetchSupabaseApi<{
      rows: SupabaseBookingRelationRow[];
    }>(`/api/admin/bookings?reference=${encodeURIComponent(reference)}`);

    return payload.rows[0] ?? null;
  } catch (error) {
    console.error(
      "[Zingara Supabase] Failed to resolve communication booking",
      error,
    );
    return undefined;
  }
}

async function getCommunicationRows() {
  try {
    const payload = await fetchSupabaseApi<{
      rows: SupabaseCommunicationRow[];
    }>("/api/admin/communications");

    return payload.rows ?? [];
  } catch (error) {
    console.error("[Zingara Supabase] Failed to load communications", error);
    return null;
  }
}

async function getCommunicationPayload(
  record: CommunicationRecord,
  context: CommunicationContext = {},
) {
  const bookingRelation = context.booking
    ? await getBookingRelation(context.booking.reference)
    : undefined;
  const customerId =
    bookingRelation?.customer_id ??
    (context.booking
      ? await getOrCreateCustomerIdFromInfo(context.booking.customer)
      : context.corporateRequest
        ? await getOrCreateCustomerIdFromInfo({
            email: context.corporateRequest.email,
            name: context.corporateRequest.contactName,
            phone: context.corporateRequest.contactNumber,
          })
        : undefined);

  return {
    booking_id: bookingRelation?.id ?? null,
    channel: toSupabaseChannel(record.channel),
    customer_id: customerId ?? null,
    message: record.message,
    sent_at: record.sentAt,
    show_id: bookingRelation?.show_id ?? null,
    status: "sent",
    subject: record.subject ?? null,
    type: toSupabaseType(record.trigger),
  };
}

function isSameCommunication(
  row: SupabaseCommunicationRow,
  payload: Awaited<ReturnType<typeof getCommunicationPayload>>,
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

export async function getCommunications() {
  const rows = await getCommunicationRows();

  if (!rows) {
    return [];
  }

  return rows.map(toCommunicationRecord);
}

export async function getCommunication(id: string) {
  const rows = await getCommunicationRows();

  if (rows) {
    const row = rows.find((communication) => communication.id === id);

    if (row) {
      return toCommunicationRecord(row);
    }
  }

  return undefined;
}

export async function getCommunicationsForBooking(booking: DemoBooking) {
  const bookingRelation = await getBookingRelation(booking.reference);

  if (!bookingRelation) {
    return [];
  }

  const rows = await getCommunicationRows();

  if (!rows) {
    return [];
  }

  const supabaseRows = rows.filter((row) => row.booking_id === bookingRelation.id);
  const supabaseCommunications = supabaseRows.map(toCommunicationRecord);

  return supabaseCommunications.sort(
    (left, right) =>
      new Date(right.sentAt).getTime() - new Date(left.sentAt).getTime(),
  );
}

export async function createCommunication(
  record: CommunicationRecord,
  context: CommunicationContext = {},
) {
  try {
    const payload = await fetchSupabaseApi<{
      row: SupabaseCommunicationRow | null;
    }>("/api/admin/communications", {
      body: {
        booking: context.booking,
        corporateRequest: context.corporateRequest,
        record,
      },
      method: "POST",
    });

    return payload.row
      ? toCommunicationRecord(payload.row as SupabaseCommunicationRow)
      : record;
  } catch (error) {
    console.error("[Zingara Supabase] Failed to create communication", error);
    return record;
  }
}

export async function updateCommunication(
  record: CommunicationRecord,
  context: CommunicationContext = {},
) {
  try {
    const payload = await fetchSupabaseApi<{
      row: SupabaseCommunicationRow | null;
    }>("/api/admin/communications", {
      body: {
        booking: context.booking,
        corporateRequest: context.corporateRequest,
        record,
      },
      method: "PATCH",
    });

    return payload.row
      ? toCommunicationRecord(payload.row as SupabaseCommunicationRow)
      : record;
  } catch (error) {
    console.error("[Zingara Supabase] Failed to update communication", error);
    return record;
  }
}

export async function syncBookingCommunications(booking: DemoBooking) {
  const supabase = getSupabaseClient();

  if (!supabase || (booking.communicationHistory ?? []).length === 0) {
    return booking.communicationHistory ?? [];
  }

  const rows = (await getCommunicationRows()) ?? [];

  await Promise.all(
    (booking.communicationHistory ?? []).map(async (record) => {
      const payload = await getCommunicationPayload(record, { booking });
      const existingRow = rows.find((row) =>
        isSameCommunication(row, payload),
      );

      if (existingRow) {
        return;
      }

      await createCommunication(record, { booking });
    }),
  );

  return booking.communicationHistory ?? [];
}

export async function syncCorporateRequestCommunications(
  request: CorporateRequest,
) {
  const supabase = getSupabaseClient();

  if (!supabase || (request.communicationHistory ?? []).length === 0) {
    return request.communicationHistory ?? [];
  }

  const rows = (await getCommunicationRows()) ?? [];

  await Promise.all(
    (request.communicationHistory ?? []).map(async (record) => {
      const payload = await getCommunicationPayload(record, {
        corporateRequest: request,
      });
      const existingRow = rows.find((row) =>
        isSameCommunication(row, payload),
      );

      if (existingRow) {
        return;
      }

      await createCommunication(record, { corporateRequest: request });
    }),
  );

  return request.communicationHistory ?? [];
}
