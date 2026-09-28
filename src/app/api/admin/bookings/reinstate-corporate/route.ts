import { notifyAppleWalletBooking } from "@/lib/appleWalletSync";
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

type RequestBody = {
  action?: "preview" | "reinstate";
  bookingReference?: string;
  expectedUpdatedAt?: string;
  idempotencyKey?: string;
};

type CapacityAllocation = {
  active_entitlement?: number;
  active_entitlement_after?: number;
  available_after?: number;
  available_before?: number;
  deficit?: number;
  effective_capacity: number;
  pax: number;
  zone_id: string;
};

type ReinstatementPreview = {
  allocations: CapacityAllocation[];
  amount_paid: number;
  balance_outstanding: number;
  booking_id: string;
  booking_reference: string;
  booking_status: string;
  code: "CAPACITY_BLOCKED" | "NOT_ELIGIBLE" | "PAYMENT_REQUIRED" | "READY";
  eligible: boolean;
  expired_at: string | null;
  floor_assignment_required: boolean;
  guest_count: number;
  payment_satisfied: boolean;
  payment_status: string;
  system_expired: boolean;
  updated_at: string;
};

function zoneLabel(zoneId: string) {
  return {
    "golden-circle": "Golden Circle",
    "middle-ring": "Middle Ring",
    "royal-balcony": "Royal Balcony",
    "royal-booths": "Private Booths",
  }[zoneId] ?? zoneId;
}

function capacityExplanation(allocation: CapacityAllocation) {
  const available = Math.max(
    (allocation.effective_capacity ?? 0) -
      (allocation.active_entitlement ?? 0),
    0,
  );
  const shortfall = Math.max(allocation.pax - available, 0);
  return `REINSTATEMENT BLOCKED — CAPACITY CONFLICT. ${allocation.pax} seats need to be restored in ${zoneLabel(allocation.zone_id)}. ${available} seats are currently available. Shortfall: ${shortfall} seats. Management must resolve capacity or booking allocation before reinstatement.`;
}

function rpcErrorResponse(error: { message?: string }) {
  const message = error.message ?? "";

  if (message.includes("BOOKING_REVISION_CHANGED")) {
    return Response.json(
      {
        code: "BOOKING_REVISION_CHANGED",
        error: "This booking changed since you opened it.",
        explanation: "Reload and review the latest payment and capacity state before reinstating.",
      },
      { status: 409 },
    );
  }
  if (message.includes("CORPORATE_REINSTATEMENT_PAYMENT_REQUIRED")) {
    return Response.json(
      {
        code: "CORPORATE_REINSTATEMENT_PAYMENT_REQUIRED",
        error: "Payment required",
        explanation: "Record the verified EFT payment before reinstating this booking.",
      },
      { status: 409 },
    );
  }
  if (message.includes("CORPORATE_REINSTATEMENT_CAPACITY_EXCEEDED")) {
    const [, zoneId = "this zone", pax = "0", active = "0", capacity = "0"] =
      message.split("|");
    return Response.json(
      {
        code: "CORPORATE_REINSTATEMENT_CAPACITY_EXCEEDED",
        error: "Capacity prevents reinstatement",
        explanation: capacityExplanation({
          active_entitlement: Number(active),
          effective_capacity: Number(capacity),
          pax: Number(pax),
          zone_id: zoneId,
        }),
      },
      { status: 409 },
    );
  }
  if (message.includes("CORPORATE_REINSTATEMENT_ALREADY_ACTIVE")) {
    return Response.json(
      {
        code: "CORPORATE_REINSTATEMENT_ALREADY_ACTIVE",
        error: "This booking has already been reinstated.",
        explanation: "Reload Booking Details to view the current authoritative state.",
      },
      { status: 409 },
    );
  }
  if (message.includes("CORPORATE_REINSTATEMENT_NOT_ELIGIBLE")) {
    return Response.json(
      {
        code: "CORPORATE_REINSTATEMENT_NOT_ELIGIBLE",
        error: "This booking is not eligible for Corporate reinstatement.",
        explanation: "Only system-expired Corporate bookings can use this workflow. Manual, customer, refunded, and restricted cancellations remain protected.",
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
  if (message.includes("CORPORATE_REINSTATEMENT_PERMISSION_REQUIRED")) {
    return Response.json({ error: "Booking management access is required." }, { status: 403 });
  }
  if (message.includes("BOOKING_NOT_FOUND") || message.includes("SHOW_NOT_FOUND")) {
    return Response.json({ code: "BOOKING_NOT_FOUND", error: "Booking could not be resolved." }, { status: 404 });
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
    const body = (await request.json().catch(() => ({}))) as RequestBody;
    const action = body.action;
    const bookingReference = body.bookingReference?.trim().toUpperCase() ?? "";
    if (!bookingReference || (action !== "preview" && action !== "reinstate")) {
      return Response.json(
        { error: "A booking reference and supported reinstatement action are required." },
        { status: 400 },
      );
    }

    const { data: booking, error: bookingError } = await auth.serviceClient
      .from("bookings")
      .select("id,show_id,booking_reference,updated_at")
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

    if (action === "preview") {
      const { data, error } = await auth.serviceClient.rpc(
        "preview_expired_corporate_reinstatement",
        { p_booking_reference: bookingReference },
      );
      if (error) {
        const response = rpcErrorResponse(error);
        if (response) return response;
        throw error;
      }
      const preview = data as ReinstatementPreview;
      const blockedAllocation = preview.allocations.find(
        (allocation) => (allocation.deficit ?? 0) > 0,
      );
      return Response.json({
        preview,
        guidance:
          blockedAllocation
            ? capacityExplanation(blockedAllocation)
            : preview.code === "PAYMENT_REQUIRED"
              ? "Record the verified EFT payment before reinstating this booking."
              : preview.code === "NOT_ELIGIBLE"
                ? "This booking was not released by the Corporate payment-expiry workflow."
                : "Payment and live capacity checks are ready for confirmation.",
      });
    }

    const expectedUpdatedAt = body.expectedUpdatedAt?.trim() ?? "";
    const idempotencyKey = body.idempotencyKey?.trim() ?? "";
    if (!expectedUpdatedAt || !idempotencyKey || idempotencyKey.length > 128) {
      return Response.json(
        { error: "The current booking revision and request identity are required." },
        { status: 400 },
      );
    }

    const ticketCode = createTicketCode(bookingReference);
    const { data, error } = await auth.serviceClient.rpc(
      "reinstate_expired_corporate_booking_atomic",
      {
        p_actor_auth_user_id: auth.user.id,
        p_actor_staff_profile_id: auth.staffProfile.id,
        p_booking_reference: bookingReference,
        p_expected_updated_at: expectedUpdatedAt,
        p_idempotency_key: idempotencyKey,
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

    const result = data as { idempotent?: boolean };
    if (!result.idempotent) {
      await notifyAppleWalletBooking(auth.serviceClient, booking.id);
    }
    return Response.json({
      message: result.idempotent
        ? "This booking was already reinstated by this request."
        : "Corporate booking reinstated successfully.",
      result,
    });
  } catch (error) {
    console.error("[Zingara API] Corporate reinstatement failed", error);
    return Response.json(
      {
        code: "CORPORATE_REINSTATEMENT_FAILED",
        error: "The Corporate booking was not reinstated.",
        explanation: "No partial lifecycle or entitlement change was retained.",
      },
      { status: 500 },
    );
  }
}
