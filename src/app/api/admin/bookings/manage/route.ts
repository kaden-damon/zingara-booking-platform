import { notifyAppleWalletBooking } from "@/lib/appleWalletSync";
import {
  loadBookingManagementContext,
  toPublicCancellationPreview,
} from "@/lib/bookingManagementServer";
import { getActorRoleLabel } from "@/lib/auditTrail";
import { normalizeStaffVenueScope } from "@/lib/staffLocations";
import {
  getAdminRoleFromName,
  requireActiveStaff,
} from "@/lib/supabase/serverAdmin";
import { normalizeShowLocation } from "@/lib/zingaraDemo";
import { rolePermissions } from "@/lib/zingaraAccess";

export const dynamic = "force-dynamic";

type RequestBody = {
  action?: "cancel" | "cancellation-preview";
  bookingReference?: string;
  expectedUpdatedAt?: string;
  reason?: string;
  stateFingerprint?: string;
};

export async function POST(request: Request) {
  const auth = await requireActiveStaff(request);
  if (auth.error || !auth.serviceClient || !auth.staffProfile || !auth.user) {
    return auth.error;
  }
  const roleRow = Array.isArray(auth.staffProfile.roles)
    ? auth.staffProfile.roles[0]
    : auth.staffProfile.roles;
  const role = getAdminRoleFromName(roleRow?.name);
  if (!role || !rolePermissions[role].includes("bookings:manage")) {
    return Response.json({ error: "Booking management access is required." }, { status: 403 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as RequestBody;
    const bookingReference = body.bookingReference?.trim().toUpperCase() ?? "";
    if (!bookingReference || !body.action) {
      return Response.json({ error: "Booking reference and action are required." }, { status: 400 });
    }
    const context = await loadBookingManagementContext(auth.serviceClient, bookingReference);
    if (!context) {
      return Response.json({ error: "Booking could not be resolved." }, { status: 404 });
    }
    const location = normalizeShowLocation(context.show.venue);
    const scope = normalizeStaffVenueScope(auth.staffProfile.venue_scope ?? []);
    if (!location || (!scope.includes("all") && !scope.includes(location))) {
      return Response.json({ error: "This booking is outside your assigned location." }, { status: 403 });
    }

    if (body.action === "cancellation-preview") {
      return Response.json({
        bookingKind: context.bookingKind,
        preview: toPublicCancellationPreview(context),
      });
    }

    if (
      body.stateFingerprint !== context.stateFingerprint ||
      body.expectedUpdatedAt !== context.booking.updated_at
    ) {
      return Response.json(
        { code: "BOOKING_CHANGED", error: "This booking changed after the preview. Refresh and review it again." },
        { status: 409 },
      );
    }
    const reason = body.reason?.trim();
    if (!reason || reason.length < 3 || reason.length > 255) {
      return Response.json({ error: "A cancellation reason is required." }, { status: 400 });
    }
    const requestId = request.headers.get("x-vercel-id") ?? request.headers.get("x-request-id") ?? crypto.randomUUID();
    const { data, error } = await auth.serviceClient.rpc("cancel_managed_booking_atomic", {
      p_action_origin: "staff",
      p_actor_auth_user_id: auth.user.id,
      p_actor_location_scope: auth.staffProfile.venue_scope ?? [],
      p_actor_name: auth.staffProfile.full_name ?? auth.user.email,
      p_actor_role: getActorRoleLabel(role),
      p_actor_staff_profile_id: auth.staffProfile.id,
      p_booking_reference: bookingReference,
      p_expected_updated_at: body.expectedUpdatedAt,
      p_policy: {
        cutoffAt: context.policy.cutoffAt,
        cutoffDays: context.policy.cutoffDays,
        forfeitedAmount: context.policy.forfeitedAmount,
        fullRefundWindow: context.policy.fullRefundWindow,
        paidAmount: context.policy.paidAmount,
        refundableAmount: context.policy.refundableAmount,
        refundState: context.policy.refundState,
      },
      p_reason: reason,
      p_request_id: requestId,
      p_user_agent: request.headers.get("user-agent"),
    });
    if (error) {
      if (error.message?.includes("BOOKING_CHANGED")) {
        return Response.json(
          { code: "BOOKING_CHANGED", error: "This booking changed after the preview. Refresh and review it again." },
          { status: 409 },
        );
      }
      throw error;
    }
    await notifyAppleWalletBooking(auth.serviceClient, context.booking.id);
    return Response.json({ idempotent: Boolean((data as { idempotent?: boolean } | null)?.idempotent), result: data });
  } catch (error) {
    console.error("[Zingara API] Managed booking action failed", error);
    return Response.json({ error: "Booking management action could not be completed. No changes were made." }, { status: 500 });
  }
}
