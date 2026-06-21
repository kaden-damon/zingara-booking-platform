import {
  type DemoBooking,
  createTicketCode,
  getBookingTicketState,
  getTicketUrl,
} from "@/lib/zingaraDemo";
import { getSupabaseClient } from "./client";
import { fetchSupabaseApi } from "./apiClient";
import { getBookings, getSupabaseBookingId } from "./bookings";

type SupabaseTicketStatus =
  | "cancelled"
  | "checked_in"
  | "expired"
  | "issued"
  | "refunded"
  | "valid"
  | "void";

type SupabaseTicketRow = {
  booking_id: string;
  id: string;
  issued_at: string;
  qr_payload: string;
  ticket_code: string;
  ticket_status: SupabaseTicketStatus;
  ticket_url: string | null;
  updated_at?: string;
};

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

function toTicketPayload(booking: DemoBooking, bookingId: string) {
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

async function getTicketRows() {
  try {
    const payload = await fetchSupabaseApi<{ rows: SupabaseTicketRow[] }>(
      "/api/admin/tickets",
    );

    return payload.rows ?? [];
  } catch (error) {
    console.error("[Zingara Supabase] Failed to load tickets", error);
    return null;
  }
}

export async function getTickets() {
  return (await getTicketRows()) ?? [];
}

export async function getTicket(code: string) {
  const rows = await getTicketRows();

  if (rows) {
    const ticket = rows.find((row) => row.ticket_code === code);

    if (ticket) {
      return ticket;
    }
  }

  const bookings = await getBookings();
  const booking = bookings.find(
    (currentBooking) =>
      currentBooking.reference === code ||
      currentBooking.ticketCode === code ||
      createTicketCode(currentBooking.reference) === code,
  );

  return booking
    ? {
        booking_id: booking.reference,
        id: booking.reference,
        issued_at: booking.ticketIssuedAt ?? booking.createdAt,
        qr_payload: getTicketUrl(booking.reference),
        ticket_code: booking.ticketCode ?? createTicketCode(booking.reference),
        ticket_status: toSupabaseTicketStatus(booking),
        ticket_url: getTicketUrl(booking.reference),
      }
    : undefined;
}

export async function createTicket(booking: DemoBooking) {
  try {
    const payload = await fetchSupabaseApi<{ row: SupabaseTicketRow | null }>(
      "/api/admin/tickets",
      {
        body: { booking },
        method: "POST",
      },
    );

    return payload.row;
  } catch (error) {
    console.error("[Zingara Supabase] Failed to create ticket", error);
    return undefined;
  }
}

export async function updateTicket(booking: DemoBooking) {
  try {
    const payload = await fetchSupabaseApi<{ row: SupabaseTicketRow | null }>(
      "/api/admin/tickets",
      {
        body: { booking },
        method: "PATCH",
      },
    );

    return payload.row;
  } catch (error) {
    console.error("[Zingara Supabase] Failed to update ticket", error);
    return undefined;
  }
}
