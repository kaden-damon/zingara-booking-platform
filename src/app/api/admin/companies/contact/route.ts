import { getActorRoleLabel } from "@/lib/auditTrail";
import {
  getRolePermissions,
  requireActiveStaff,
} from "@/lib/supabase/serverAdmin";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  const auth = await requireActiveStaff(request);
  if (
    auth.error ||
    !auth.serviceClient ||
    !auth.staffProfile ||
    !auth.user
  ) {
    return auth.error;
  }
  const role = Array.isArray(auth.staffProfile.roles)
    ? auth.staffProfile.roles[0]
    : auth.staffProfile.roles;
  if (!getRolePermissions(role).includes("bookings:manage")) {
    return Response.json(
      { error: "Booking management access is required." },
      { status: 403 },
    );
  }

  try {
    const body = (await request.json()) as {
      companyId?: string | null;
      customerId?: string;
      expectedRevision?: number;
      jobTitle?: string;
    };
    if (!body.customerId || !Number.isInteger(body.expectedRevision)) {
      return Response.json(
        { error: "Customer and current revision are required." },
        { status: 400 },
      );
    }
    const { data, error } = await auth.serviceClient.rpc(
      "link_customer_company_atomic",
      {
        p_actor_auth_user_id: auth.user.id,
        p_actor_location_scope: auth.staffProfile.venue_scope ?? [],
        p_actor_name: auth.staffProfile.full_name ?? auth.user.email,
        p_actor_role: getActorRoleLabel(role?.name),
        p_actor_staff_profile_id: auth.staffProfile.id,
        p_company_id: body.companyId ?? null,
        p_customer_id: body.customerId,
        p_expected_revision: body.expectedRevision,
        p_job_title: body.jobTitle ?? "",
        p_request_id:
          request.headers.get("x-vercel-id") ??
          request.headers.get("x-request-id") ??
          crypto.randomUUID(),
        p_user_agent: request.headers.get("user-agent"),
      },
    );
    if (error) {
      const message = error.message ?? "";
      if (message.includes("CUSTOMER_CHANGED")) {
        return Response.json(
          { error: "This Customer changed. Refresh and try again." },
          { status: 409 },
        );
      }
      if (message.includes("NOT_AVAILABLE")) {
        return Response.json(
          { error: "The selected Customer or Company is no longer available." },
          { status: 409 },
        );
      }
      throw error;
    }

    return Response.json({ customer: data });
  } catch (error) {
    console.error("[Zingara API] Failed to link Company contact", error);
    return Response.json(
      { error: "The Company contact could not be updated." },
      { status: 500 },
    );
  }
}
