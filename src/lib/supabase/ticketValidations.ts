import {
  type DemoBooking,
  createTicketCode,
} from "@/lib/zingaraDemo";
import { getSupabaseClient } from "./client";
import { fetchSupabaseApi } from "./apiClient";
import { getSupabaseBookingId } from "./bookings";

type SupabaseValidationResult =
  | "already_used"
  | "cancelled"
  | "checked_in"
  | "invalid"
  | "refunded"
  | "valid";

type TicketValidationRecord = {
  bookingReference?: string;
  code?: string;
  deviceLabel?: string;
  id: string;
  notes?: string;
  result: SupabaseValidationResult;
  ticketCode?: string;
  validatedAt: string;
};

type SupabaseTicketValidationRow = {
  booking_id: string;
  device_label: string | null;
  id: string;
  notes: string | null;
  result: SupabaseValidationResult;
  ticket_id: string;
  validated_at: string;
};

type SupabaseTicketRow = {
  booking_id: string;
  id: string;
  ticket_code: string;
};

function toTicketValidationRecord(
  row: SupabaseTicketValidationRow,
): TicketValidationRecord {
  return {
    deviceLabel: row.device_label ?? undefined,
    id: row.id,
    notes: row.notes ?? undefined,
    result: row.result,
    validatedAt: row.validated_at,
  };
}

async function getTicketRows() {
  try {
    const payload = await fetchSupabaseApi<{ rows: SupabaseTicketRow[] }>(
      "/api/admin/tickets",
    );

    return payload.rows ?? [];
  } catch (error) {
    console.error(
      "[Zingara Supabase] Failed to load validation tickets",
      error,
    );
    return null;
  }
}

async function getTicketForBooking(booking: DemoBooking) {
  const bookingId = await getSupabaseBookingId(booking.reference);
  const ticketRows = await getTicketRows();
  const ticketCode = booking.ticketCode ?? createTicketCode(booking.reference);

  return ticketRows?.find(
    (ticket) =>
      ticket.ticket_code === ticketCode ||
      (!!bookingId && ticket.booking_id === bookingId),
  );
}

async function getTicketValidationRows() {
  try {
    const payload = await fetchSupabaseApi<{
      rows: SupabaseTicketValidationRow[];
    }>("/api/admin/ticket-validations");

    return payload.rows ?? [];
  } catch (error) {
    console.error("[Zingara Supabase] Failed to load ticket validations", error);
    return null;
  }
}

export async function getTicketValidations() {
  const rows = await getTicketValidationRows();

  if (!rows) {
    return [];
  }

  return rows.map(toTicketValidationRecord);
}

export async function createTicketValidation({
  booking,
  code,
  deviceLabel = "Box Office",
  notes,
  result,
}: {
  booking?: DemoBooking;
  code?: string;
  deviceLabel?: string;
  notes?: string;
  result: SupabaseValidationResult;
}) {
  const validatedAt = new Date().toISOString();
  const fallbackValidation: TicketValidationRecord = {
    bookingReference: booking?.reference,
    code,
    deviceLabel,
    id: `${booking?.reference ?? code ?? "unknown"}-${result}-${Date.now().toString(36)}`,
    notes,
    result,
    ticketCode: booking?.ticketCode ?? (booking ? createTicketCode(booking.reference) : undefined),
    validatedAt,
  };
  if (!booking) {
    return fallbackValidation;
  }

  try {
    const payload = await fetchSupabaseApi<{
      row: SupabaseTicketValidationRow | null;
    }>("/api/admin/tickets/validate", {
      body: {
        booking,
        code,
        deviceLabel,
        notes,
        result,
        validatedAt,
      },
      method: "POST",
    });

    return payload.row
      ? toTicketValidationRecord(payload.row as SupabaseTicketValidationRow)
      : fallbackValidation;
  } catch (error) {
    console.error("[Zingara Supabase] Failed to create ticket validation", error);
    return fallbackValidation;
  }
}
