import { normalizeStaffVenueScope } from "@/lib/staffLocations";
import { getRolePermissions, requireActiveStaff } from "@/lib/supabase/serverAdmin";
import { recordAuditEvent } from "@/lib/supabase/serverAudit";

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
    const body = (await request.json()) as { action?: "mark" | "undo"; feedbackId?: string; revision?: number };
    if (!body.feedbackId || !Number.isInteger(body.revision) || !["mark", "undo"].includes(body.action ?? "")) {
      return Response.json({ error: "Choose a valid contact action." }, { status: 400 });
    }
    const { data: before, error: beforeError } = await auth.serviceClient
      .from("platform_feedback_submissions")
      .select("id,venue,contacted_at,contact_method,revision")
      .eq("id", body.feedbackId)
      .maybeSingle();
    if (beforeError) throw beforeError;
    if (!before) return Response.json({ error: "Platform feedback was not found." }, { status: 404 });
    const venues = normalizeStaffVenueScope(auth.staffProfile.venue_scope);
    if (!venues.includes("all") && !venues.includes(before.venue)) {
      return Response.json({ error: "You do not have access to this venue." }, { status: 403 });
    }
    if (body.action === "undo" && before.contact_method !== "manual_follow_up") {
      return Response.json({ error: "Only a manual contact mark can be undone." }, { status: 409 });
    }
    const timestamp = body.action === "mark" ? new Date().toISOString() : null;
    const { data: after, error } = await auth.serviceClient
      .from("platform_feedback_submissions")
      .update({
        contacted_at: timestamp,
        contacted_by: body.action === "mark" ? auth.staffProfile.id : null,
        contact_method: body.action === "mark" ? "manual_follow_up" : null,
        revision: before.revision + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", before.id)
      .eq("revision", body.revision)
      .select("id,revision,contacted_at,contact_method")
      .maybeSingle();
    if (error) throw error;
    if (!after) return Response.json({ error: "This feedback changed. Refresh and try again." }, { status: 409 });
    await auth.serviceClient.from("platform_feedback_events").insert({
      actor_staff_profile_id: auth.staffProfile.id,
      event_type: body.action === "mark" ? "contacted" : "contact_undone",
      feedback_id: before.id,
    });
    await recordAuditEvent(auth.serviceClient, auth.staffProfile, auth.user, {
      action: body.action === "mark" ? "platform_feedback.contacted" : "platform_feedback.contact_undone",
      entityId: before.id,
      entityLocation: before.venue,
      entityReference: before.id,
      entityType: "review",
      outcome: "success",
      request,
      sourceArea: "reviews",
    });
    return Response.json({ feedback: after });
  } catch (error) {
    console.error("[Platform Feedback] Contact update failed", error);
    return Response.json({ error: "The contact status could not be updated." }, { status: 500 });
  }
}
