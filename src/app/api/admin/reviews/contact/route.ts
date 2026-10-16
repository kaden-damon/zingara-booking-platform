import { normalizeStaffVenueScope } from "@/lib/staffLocations";
import { getRolePermissions, requireActiveStaff } from "@/lib/supabase/serverAdmin";
import { recordAuditEvent } from "@/lib/supabase/serverAudit";

export const dynamic = "force-dynamic";

function roleOf(profile: NonNullable<Awaited<ReturnType<typeof requireActiveStaff>>["staffProfile"]>) {
  return Array.isArray(profile.roles) ? profile.roles[0] : profile.roles;
}

export async function POST(request: Request) {
  const auth = await requireActiveStaff(request);
  if (auth.error || !auth.serviceClient || !auth.staffProfile || !auth.user) return auth.error;
  if (!getRolePermissions(roleOf(auth.staffProfile)).includes("communications:manage")) {
    return Response.json({ error: "Communications management access is required." }, { status: 403 });
  }

  try {
    const body = await request.json() as {
      action?: "mark" | "undo";
      reviewId?: string;
      revision?: number;
    };
    if (
      !body.reviewId ||
      !/^[0-9a-f-]{36}$/i.test(body.reviewId) ||
      !Number.isInteger(body.revision) ||
      (body.action !== "mark" && body.action !== "undo")
    ) {
      return Response.json({ error: "Choose a valid contact action." }, { status: 400 });
    }

    const { data: review, error: reviewError } = await auth.serviceClient
      .from("guest_reviews")
      .select("id,venue,revision,contacted_at,contact_method")
      .eq("id", body.reviewId)
      .maybeSingle();
    if (reviewError) throw reviewError;
    if (!review) return Response.json({ error: "Review not found." }, { status: 404 });

    const scope = normalizeStaffVenueScope(auth.staffProfile.venue_scope ?? []);
    if (!scope.includes("all") && !scope.includes(review.venue)) {
      return Response.json({ error: "You do not have access to this venue." }, { status: 403 });
    }

    const { data, error } = await auth.serviceClient.rpc("set_guest_review_contacted", {
      p_actor_staff_profile_id: auth.staffProfile.id,
      p_contacted: body.action === "mark",
      p_expected_revision: body.revision,
      p_review_id: body.reviewId,
    });
    if (error) {
      if (error.message.includes("REVIEW_STALE_REVISION")) {
        return Response.json({ error: "This review changed. Refresh and try again." }, { status: 409 });
      }
      if (error.message.includes("REVIEW_CONTACT_UNDO_HAS_REPLY")) {
        return Response.json({ error: "A sent reply confirms this contact and can't be undone." }, { status: 409 });
      }
      throw error;
    }

    await recordAuditEvent(auth.serviceClient, auth.staffProfile, auth.user, {
      action: body.action === "mark" ? "review.contact_marked" : "review.contact_undone",
      afterValues: { contacted: body.action === "mark", method: body.action === "mark" ? "manual_follow_up" : null },
      beforeValues: { contacted: Boolean(review.contacted_at), method: review.contact_method },
      changedFields: ["contactedAt", "contactMethod", "revision"],
      entityId: body.reviewId,
      entityLocation: review.venue,
      entityReference: body.reviewId,
      entityType: "review",
      outcome: "success",
      request,
      sourceArea: "Guest Reviews",
    });

    return Response.json({ review: data });
  } catch (error) {
    console.error("[Guest Reviews] Contact status update failed", error);
    return Response.json({ error: "The contact status couldn't be updated. Try again." }, { status: 500 });
  }
}
