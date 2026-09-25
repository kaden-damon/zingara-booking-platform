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
  bookingReference?: string;
  expectedUpdatedAt?: string;
  idempotencyKey?: string;
  reason?: string;
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

  if (message.includes("SHOW_OUTSIDE_STAFF_SCOPE")) {
    return Response.json(
      { code: "SHOW_OUTSIDE_STAFF_SCOPE", error: "This booking is outside your assigned location." },
      { status: 403 },
    );
  }

  if (message.includes("MARK_PAID_NOT_ALLOWED")) {
    return Response.json(
      {
        code: "MARK_PAID_NOT_ALLOWED",
        error: "This booking cannot be manually marked paid in its current state.",
        explanation: "Review the booking lifecycle and payment controls before trying another action.",
      },
      { status: 409 },
    );
  }

  if (message.includes("BOOKING_NOT_FOUND") || message.includes("SHOW_NOT_FOUND")) {
    return Response.json({ code: "BOOKING_NOT_FOUND", error: "Booking could not be resolved." }, { status: 404 });
  }

  if (message.includes("MARK_PAID_PERMISSION_REQUIRED")) {
    return Response.json({ error: "Booking management access is required." }, { status: 403 });
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
  if (!getRolePermissions(role).includes("bookings:manage")) {
    return Response.json({ error: "Booking management access is required." }, { status: 403 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as MarkPaidBody;
    const bookingReference = body.bookingReference?.trim().toUpperCase() ?? "";
    const expectedUpdatedAt = body.expectedUpdatedAt?.trim() ?? "";
    const idempotencyKey = body.idempotencyKey?.trim() ?? "";
    const reason = body.reason?.trim() ?? "";

    if (
      !bookingReference ||
      !expectedUpdatedAt ||
      !idempotencyKey ||
      idempotencyKey.length > 128 ||
      reason.length < 3 ||
      reason.length > 500
    ) {
      return Response.json(
        { error: "Booking, current revision, payment reason and request identity are required." },
        { status: 400 },
      );
    }

    const { data: booking, error: bookingError } = await auth.serviceClient
      .from("bookings")
      .select("id,show_id,booking_reference")
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
    const { data, error } = await auth.serviceClient.rpc("mark_booking_paid_atomic", {
      p_actor_auth_user_id: auth.user.id,
      p_actor_staff_profile_id: auth.staffProfile.id,
      p_booking_reference: bookingReference,
      p_expected_updated_at: expectedUpdatedAt,
      p_idempotency_key: idempotencyKey,
      p_reason: reason,
      p_ticket_code: ticketCode,
      p_ticket_url: getTicketUrl(bookingReference),
      p_user_agent: request.headers.get("user-agent"),
    });

    if (error) {
      const response = rpcErrorResponse(error);
      if (response) return response;
      throw error;
    }

    const result = data as MarkPaidResult;
    return Response.json({
      message: result.idempotent
        ? "This manual payment was already recorded."
        : "Manual payment recorded successfully.",
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
