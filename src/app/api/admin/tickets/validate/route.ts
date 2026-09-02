import {
  type DemoBooking,
  createTicketCode,
  normalizeTicketReference,
} from "@/lib/zingaraDemo";
import { notifyAppleWalletTickets } from "@/lib/appleWalletSync";
import {
  getRolePermissions,
  isSuperAdminProfile,
  requireActiveStaff,
} from "@/lib/supabase/serverAdmin";

export const dynamic = "force-dynamic";

type SupabaseValidationResult =
  | "already_used"
  | "cancelled"
  | "checked_in"
  | "invalid"
  | "refunded"
  | "valid";

const terminalTicketStatuses = new Set([
  "cancelled",
  "expired",
  "refunded",
  "void",
]);

const showMetadataPrefix = "__zingara_show_meta__:";

function getLegacyShowReference(notes: string | null) {
  if (!notes?.startsWith(showMetadataPrefix)) {
    return "";
  }

  try {
    const metadata = JSON.parse(notes.slice(showMetadataPrefix.length)) as {
      legacyId?: string;
    };

    return metadata.legacyId?.trim() ?? "";
  } catch {
    return "";
  }
}

export async function POST(request: Request) {
  const auth = await requireActiveStaff(request);

  if (auth.error || !auth.serviceClient || !auth.staffProfile) {
    return (
      auth.error ??
      Response.json({ error: "Unauthorized." }, { status: 401 })
    );
  }

  const role = Array.isArray(auth.staffProfile.roles)
    ? auth.staffProfile.roles[0]
    : auth.staffProfile.roles;

  if (
    !isSuperAdminProfile(auth.staffProfile) &&
    !getRolePermissions(role).includes("tickets:validate")
  ) {
    return Response.json(
      { error: "You do not have permission to validate tickets." },
      { status: 403 },
    );
  }

  const supabase = auth.serviceClient;

  try {
    const body = (await request.json()) as {
      booking?: DemoBooking;
      code?: string;
      deviceLabel?: string;
      notes?: string;
      result?: SupabaseValidationResult;
      showReference?: string;
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

    if (body.result === "checked_in" && !body.showReference) {
      return Response.json(
        { error: "A selected performance is required for check-in." },
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
      .select("id,booking_id,ticket_code,ticket_status")
      .in("ticket_code", ticketCodes)
      .limit(1);

    if (ticketError) {
      throw ticketError;
    }

    const ticket = ticketRows?.[0] as
      | {
          booking_id: string;
          id: string;
          ticket_code: string;
          ticket_status: string;
        }
      | undefined;

    if (!ticket) {
      return Response.json(
        { error: "Ticket could not be resolved for validation." },
        { status: 404 },
      );
    }

    if (body.showReference) {
      const { data: bookingRow, error: bookingError } = await supabase
        .from("bookings")
        .select("show_id")
        .eq("id", ticket.booking_id)
        .maybeSingle();

      if (bookingError) {
        throw bookingError;
      }

      const { data: showRow, error: showError } = bookingRow?.show_id
        ? await supabase
            .from("shows")
            .select("id,notes")
            .eq("id", bookingRow.show_id)
            .maybeSingle()
        : { data: null, error: null };

      if (showError) {
        throw showError;
      }

      const showIdentities = [
        bookingRow?.show_id,
        showRow?.id,
        getLegacyShowReference(showRow?.notes ?? null),
      ].filter(Boolean);

      if (!showIdentities.includes(body.showReference)) {
        return Response.json(
          { error: "This ticket does not belong to the selected performance." },
          { status: 409 },
        );
      }
    }

    if (
      terminalTicketStatuses.has(ticket.ticket_status) &&
      (body.result === "checked_in" || body.result === "valid")
    ) {
      return Response.json(
        {
          error: "This ticket is no longer valid for admission.",
          ticketStatus: ticket.ticket_status,
        },
        { status: 409 },
      );
    }

    if (
      body.result === "checked_in" &&
      ticket.ticket_status === "checked_in"
    ) {
      return Response.json({
        alreadyCheckedIn: true,
        row: null,
        ticketStatus: "checked_in",
      });
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

    if (body.result === "checked_in" && ticket.ticket_status !== "checked_in") {
      const { error: updateError } = await supabase
        .from("tickets")
        .update({
          ticket_status: "checked_in",
          updated_at: new Date().toISOString(),
        })
        .eq("id", ticket.id);

      if (updateError) {
        throw updateError;
      }

      await notifyAppleWalletTickets(supabase, [ticket.id]);
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
