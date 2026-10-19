import { getActorRoleLabel } from "@/lib/auditTrail";
import { getAdminRoleFromName, requireActiveStaff } from "@/lib/supabase/serverAdmin";

export const dynamic = "force-dynamic";

const managementRoles = new Set(["super-admin", "venue-manager", "box-office-manager"]);

export async function POST(request: Request) {
  const auth = await requireActiveStaff(request);
  if (auth.error || !auth.serviceClient || !auth.staffProfile || !auth.user) return auth.error;
  const roleRow = Array.isArray(auth.staffProfile.roles) ? auth.staffProfile.roles[0] : auth.staffProfile.roles;
  const role = getAdminRoleFromName(roleRow?.name);
  if (!managementRoles.has(role)) {
    return Response.json({ error: "Management permission is required." }, { status: 403 });
  }

  try {
    const body = await request.json() as {
      bookingReference?: string;
      customerId?: string;
      expectedUpdatedAt?: string;
      reason?: string;
    };
    const sessionId = request.headers.get("x-zingara-booking-lock-session")?.trim() ?? "";
    if (!body.bookingReference || !body.customerId || !body.expectedUpdatedAt || !body.reason?.trim() || !sessionId) {
      return Response.json({ error: "Booking, customer, reason and active editing session are required." }, { status: 400 });
    }
    const { data, error } = await auth.serviceClient.rpc("reassign_booking_customer_atomic", {
      p_actor_auth_user_id: auth.user.id,
      p_actor_location_scope: auth.staffProfile.venue_scope ?? [],
      p_actor_name: auth.staffProfile.full_name ?? auth.user.email,
      p_actor_role: getActorRoleLabel(role),
      p_actor_staff_profile_id: auth.staffProfile.id,
      p_booking_reference: body.bookingReference,
      p_expected_updated_at: body.expectedUpdatedAt,
      p_lock_session_id: sessionId,
      p_new_customer_id: body.customerId,
      p_reason: body.reason,
      p_request_id: request.headers.get("x-vercel-id") ?? request.headers.get("x-request-id") ?? crypto.randomUUID(),
      p_user_agent: request.headers.get("user-agent"),
    });
    if (error) {
      const message = error.message ?? "";
      if (message.includes("BOOKING_CHANGED")) return Response.json({ error: "This booking changed. Refresh it and try again." }, { status: 409 });
      if (message.includes("BOOKING_LOCK_REQUIRED")) return Response.json({ error: "Your editing session expired. Reopen the booking and try again." }, { status: 409 });
      if (message.includes("CUSTOMER_NOT_AVAILABLE")) return Response.json({ error: "That customer is no longer available. Choose another customer." }, { status: 409 });
      if (message.includes("VENUE_SCOPE_REQUIRED") || message.includes("MANAGEMENT_PERMISSION_REQUIRED")) return Response.json({ error: "You do not have permission to change this booking customer." }, { status: 403 });
      throw error;
    }
    return Response.json({ result: data });
  } catch (error) {
    console.error("[Zingara API] Booking customer reassignment failed", error);
    return Response.json({ error: "The linked customer couldn't be changed. Try again." }, { status: 500 });
  }
}
