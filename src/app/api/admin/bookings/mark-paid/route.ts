import { normalizeStaffVenueScope } from "@/lib/staffLocations";
import {
  getRolePermissions,
  requireActiveStaff,
} from "@/lib/supabase/serverAdmin";
import {
  createTicketCode,
  getTicketUrl,
  normalizeShowLocation,
} from "@/lib/zingaraDemo";

export const dynamic = "force-dynamic";

type MarkPaidBody = {
  amountReceived?: number;
  bankReference?: string;
  bookingReference?: string;
  confirmed?: boolean;
  evidenceNote?: string;
  expectedUpdatedAt?: string;
  idempotencyKey?: string;
  receivedOn?: string;
};

type MarkPaidResult = {
  amount_paid: number;
  balance_outstanding: number;
  booking_reference: string;
  booking_status: string;
  idempotent: boolean;
  manual_payment_amount?: number;
  payment_id?: string;
  payment_links_revoked?: number;
  payment_status: string;
  status: "already_processed" | "processed";
  tickets_updated?: number;
  total_amount: number;
  updated_at: string;
};

function rpcErrorResponse(error: { message?: string }) {
  const message = error.message ?? "";

  if (message.includes("BOOKING_REVISION_CHANGED")) {
    return Response.json(
      {
        code: "BOOKING_REVISION_CHANGED",
        error: "This booking changed before the payment could be recorded.",
        explanation: "Reload the booking and review its latest payment state before trying again.",
      },
      { status: 409 },
    );
  }

  if (message.includes("BOOKING_ALREADY_PAID")) {
    return Response.json(
      {
        code: "BOOKING_ALREADY_PAID",
        error: "This booking is already fully paid.",
        explanation: "No additional manual payment was recorded.",
      },
      { status: 409 },
    );
  }

  if (message.includes("MANUAL_EFT_REFERENCE_DUPLICATE")) {
    return Response.json(
      {
        code: "MANUAL_EFT_REFERENCE_DUPLICATE",
        error: "This bank reference has already been recorded.",
        explanation: "Review the existing payment before recording anything else.",
      },
      { status: 409 },
    );
  }

  if (message.includes("MANUAL_EFT_EXCEEDS_OUTSTANDING")) {
    return Response.json(
      {
        code: "MANUAL_EFT_EXCEEDS_OUTSTANDING",
        error: "The amount received is more than the outstanding balance.",
        explanation: "Check the amount and the latest booking balance before continuing.",
      },
      { status: 409 },
    );
  }

  if (message.includes("SHOW_OUTSIDE_STAFF_SCOPE")) {
    return Response.json(
      { code: "SHOW_OUTSIDE_STAFF_SCOPE", error: "This booking is outside your assigned location." },
      { status: 403 },
    );
  }

  if (message.includes("MANUAL_EFT_NOT_ALLOWED")) {
    return Response.json(
      {
        code: "MARK_PAID_NOT_ALLOWED",
        error: "A manual EFT cannot be recorded for this booking in its current state.",
        explanation: "Review the booking lifecycle and payment controls before trying another action.",
      },
      { status: 409 },
    );
  }

  if (message.includes("BOOKING_NOT_FOUND") || message.includes("SHOW_NOT_FOUND")) {
    return Response.json({ code: "BOOKING_NOT_FOUND", error: "Booking could not be resolved." }, { status: 404 });
  }

  if (message.includes("MANUAL_EFT_PERMISSION_REQUIRED")) {
    return Response.json({ error: "Booking reconciliation access is required." }, { status: 403 });
  }

  return null;
}

export async function POST(request: Request) {
  const auth = await requireActiveStaff(request);
  if (auth.error || !auth.serviceClient || !auth.staffProfile || !auth.user) {
    return auth.error;
  }

  const role = Array.isArray(auth.staffProfile.roles)
    ? auth.staffProfile.roles[0]
    : auth.staffProfile.roles;
  if (!getRolePermissions(role).includes("bookings:reconcile")) {
    return Response.json({ error: "Booking reconciliation access is required." }, { status: 403 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as MarkPaidBody;
    const bookingReference = body.bookingReference?.trim().toUpperCase() ?? "";
    const amountReceived = Number(body.amountReceived);
    const bankReference = body.bankReference?.trim() ?? "";
    const evidenceNote = body.evidenceNote?.trim() ?? "";
    const expectedUpdatedAt = body.expectedUpdatedAt?.trim() ?? "";
    const idempotencyKey = body.idempotencyKey?.trim() ?? "";
    const receivedOn = body.receivedOn?.trim() ?? "";

    if (
      !bookingReference ||
      !Number.isFinite(amountReceived) ||
      amountReceived <= 0 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(receivedOn) ||
      bankReference.length < 3 ||
      bankReference.length > 120 ||
      evidenceNote.length < 3 ||
      evidenceNote.length > 500 ||
      body.confirmed !== true ||
      !expectedUpdatedAt ||
      !idempotencyKey ||
      idempotencyKey.length > 128
    ) {
      return Response.json(
        { error: "Amount received, date received, bank reference, note and confirmation are required." },
        { status: 400 },
      );
    }

    const { data: booking, error: bookingError } = await auth.serviceClient
      .from("bookings")
      .select("id,show_id,booking_reference,booking_origin,booking_source,booking_status,corporate_payment_expired_at")
      .eq("booking_reference", bookingReference)
      .maybeSingle();
    if (bookingError) throw bookingError;
    if (!booking) {
      return Response.json({ error: "Booking could not be resolved." }, { status: 404 });
    }

    const { data: show, error: showError } = await auth.serviceClient
      .from("shows")
      .select("venue")
      .eq("id", booking.show_id)
      .maybeSingle();
    if (showError) throw showError;
    const venue = normalizeShowLocation(show?.venue);
    const scope = normalizeStaffVenueScope(auth.staffProfile.venue_scope ?? []);
    if (!venue || (!scope.includes("all") && !scope.includes(venue))) {
      return Response.json({ error: "This booking is outside your assigned location." }, { status: 403 });
    }

    const ticketCode = createTicketCode(bookingReference);
    const { data, error } = await auth.serviceClient.rpc(
      "record_manual_eft_payment_atomic",
      {
        p_actor_auth_user_id: auth.user.id,
        p_actor_staff_profile_id: auth.staffProfile.id,
        p_amount_received: amountReceived,
        p_bank_reference: bankReference,
        p_booking_reference: bookingReference,
        p_confirmed: true,
        p_evidence_note: evidenceNote,
        p_expected_updated_at: expectedUpdatedAt,
        p_idempotency_key: idempotencyKey,
        p_received_on: receivedOn,
        p_ticket_code: ticketCode,
        p_ticket_url: getTicketUrl(bookingReference),
        p_user_agent: request.headers.get("user-agent"),
      },
    );

    if (error) {
      const response = rpcErrorResponse(error);
      if (response) return response;
      throw error;
    }

    const result = data as MarkPaidResult;
    return Response.json({
      message: result.idempotent
        ? "This EFT payment was already recorded."
        : result.booking_status === "cancelled"
          ? "EFT payment recorded. The booking remains cancelled until an authorised reinstatement."
          : "EFT payment recorded successfully.",
      result,
    });
  } catch (error) {
    console.error("[Zingara API] Atomic Mark Paid failed", error);
    return Response.json(
      {
        code: "MARK_PAID_FAILED",
        error: "The booking was not marked paid.",
        explanation: "No partial financial change was retained. Review the booking and try again.",
      },
      { status: 500 },
    );
  }
}
