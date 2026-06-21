import { getServiceClient } from "@/lib/supabase/serverAdmin";
import {
  type DemoBooking,
  createTicketCode,
  getBookingTicketState,
  getTicketUrl,
} from "@/lib/zingaraDemo";

export const dynamic = "force-dynamic";

export async function GET() {
  const serviceClient = getServiceClient();

  if (!serviceClient) {
    return Response.json(
      { error: "Supabase service role is not configured." },
      { status: 500 },
    );
  }

  const { data, error } = await serviceClient
    .from("tickets")
    .select("id,booking_id,ticket_code,ticket_url,qr_payload,ticket_status,issued_at,updated_at")
    .order("issued_at", { ascending: false });

  if (error) {
    console.error("[Zingara API] Failed to load tickets", error);

    return Response.json(
      { error: "Tickets could not be loaded." },
      { status: 500 },
    );
  }

  return Response.json({ rows: data ?? [] });
}

type SupabaseTicketStatus =
  | "cancelled"
  | "checked_in"
  | "expired"
  | "issued"
  | "refunded"
  | "valid"
  | "void";

function getRouteClient() {
  return getServiceClient();
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

async function upsertTicket(booking: DemoBooking) {
  const supabase = getRouteClient();

  if (!supabase) {
    throw new Error("Supabase client is not configured.");
  }

  const { data: bookingRows, error: bookingError } = await supabase
    .from("bookings")
    .select("id")
    .eq("booking_reference", booking.reference)
    .limit(1);

  if (bookingError) {
    throw bookingError;
  }

  const bookingId = (bookingRows?.[0] as { id?: string } | undefined)?.id;

  if (!bookingId) {
    throw new Error("Booking could not be resolved for ticket.");
  }

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
  const query = existingId
    ? supabase.from("tickets").update(payload).eq("id", existingId)
    : supabase.from("tickets").insert(payload);
  const { data, error } = await query
    .select("id,booking_id,ticket_code,ticket_url,qr_payload,ticket_status,issued_at,updated_at")
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { booking?: DemoBooking };

    if (!body.booking) {
      return Response.json(
        { error: "Booking payload is required." },
        { status: 400 },
      );
    }

    const row = await upsertTicket(body.booking);

    return Response.json({ row });
  } catch (error) {
    console.error("[Zingara API] Failed to save ticket", error);

    return Response.json(
      { error: "Ticket could not be saved." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  return POST(request);
}
