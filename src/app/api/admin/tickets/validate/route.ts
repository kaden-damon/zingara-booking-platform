import {
  type DemoBooking,
  createTicketCode,
  normalizeTicketReference,
} from "@/lib/zingaraDemo";
import { getServiceClient } from "@/lib/supabase/serverAdmin";

export const dynamic = "force-dynamic";

type SupabaseValidationResult =
  | "already_used"
  | "cancelled"
  | "checked_in"
  | "invalid"
  | "refunded"
  | "valid";

function getRouteClient() {
  return getServiceClient();
}

export async function POST(request: Request) {
  const supabase = getRouteClient();

  if (!supabase) {
    return Response.json(
      { error: "Supabase client is not configured." },
      { status: 500 },
    );
  }

  try {
    const body = (await request.json()) as {
      booking?: DemoBooking;
      code?: string;
      deviceLabel?: string;
      notes?: string;
      result?: SupabaseValidationResult;
      validatedAt?: string;
    };

    if (!body.booking && !body.code) {
      return Response.json(
        { error: "Booking or ticket code is required." },
        { status: 400 },
      );
    }

    if (!body.result) {
      return Response.json(
        { error: "Validation result is required." },
        { status: 400 },
      );
    }

    const ticketCode =
      body.booking?.ticketCode ??
      (body.booking ? createTicketCode(body.booking.reference) : "");
    const normalizedCode = normalizeTicketReference(body.code ?? ticketCode);
    const ticketCodes = Array.from(
      new Set([ticketCode, normalizedCode].filter(Boolean)),
    );
    const { data: ticketRows, error: ticketError } = await supabase
      .from("tickets")
      .select("id,booking_id,ticket_code")
      .in("ticket_code", ticketCodes)
      .limit(1);

    if (ticketError) {
      throw ticketError;
    }

    const ticket = ticketRows?.[0] as
      | { booking_id: string; id: string; ticket_code: string }
      | undefined;

    if (!ticket) {
      return Response.json(
        { error: "Ticket could not be resolved for validation." },
        { status: 404 },
      );
    }

    const { data, error } = await supabase
      .from("ticket_validations")
      .insert({
        booking_id: ticket.booking_id,
        device_label: body.deviceLabel ?? "Box Office",
        notes: body.notes ?? null,
        result: body.result,
        ticket_id: ticket.id,
        validated_at: body.validatedAt ?? new Date().toISOString(),
      })
      .select("id,ticket_id,booking_id,result,device_label,notes,validated_at")
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (body.result === "checked_in") {
      const { error: updateError } = await supabase
        .from("tickets")
        .update({ ticket_status: "checked_in" })
        .eq("id", ticket.id);

      if (updateError) {
        throw updateError;
      }
    }

    return Response.json({ row: data });
  } catch (error) {
    console.error("[Zingara API] Failed to create ticket validation", error);

    return Response.json(
      { error: "Ticket validation could not be created." },
      { status: 500 },
    );
  }
}
