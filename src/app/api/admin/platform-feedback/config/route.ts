import { loadPlatformFeedbackCampaignConfiguration } from "@/lib/platformFeedbackConfiguration";
import {
  validatePlatformFeedbackEmailTemplate,
  type PlatformFeedbackEmailTemplate,
} from "@/lib/platformFeedback";
import { getRolePermissions, requireActiveStaff } from "@/lib/supabase/serverAdmin";
import { recordAuditEvent } from "@/lib/supabase/serverAudit";

export const dynamic = "force-dynamic";

function roleOf(profile: NonNullable<Awaited<ReturnType<typeof requireActiveStaff>>["staffProfile"]>) {
  return Array.isArray(profile.roles) ? profile.roles[0] : profile.roles;
}

function canManage(profile: NonNullable<Awaited<ReturnType<typeof requireActiveStaff>>["staffProfile"]>) {
  return getRolePermissions(roleOf(profile)).includes("communications:manage");
}

async function payload(auth: Awaited<ReturnType<typeof requireActiveStaff>>) {
  const [campaign, staffResult] = await Promise.all([
    loadPlatformFeedbackCampaignConfiguration(auth.serviceClient!),
    auth.serviceClient!
      .from("staff_profiles")
      .select("id,full_name,email")
      .eq("active", true)
      .not("email", "is", null)
      .order("full_name"),
  ]);
  if (staffResult.error) throw staffResult.error;
  const staffOptions = (staffResult.data ?? []).map((staff) => ({
    email: staff.email,
    id: staff.id,
    name: staff.full_name,
  }));
  const defaultNames = new Set(["kaden damon", "nicky-anne de beer"]);
  return {
    campaign,
    defaultRecipientIds: staffOptions
      .filter((staff) => defaultNames.has(staff.name.trim().toLowerCase()))
      .map((staff) => staff.id),
    staffOptions,
  };
}

export async function GET(request: Request) {
  const auth = await requireActiveStaff(request);
  if (auth.error || !auth.serviceClient || !auth.staffProfile) return auth.error;
  if (!canManage(auth.staffProfile)) {
    return Response.json({ error: "Communications management access is required." }, { status: 403 });
  }
  try {
    return Response.json(await payload(auth));
  } catch (error) {
    console.error("[Platform Feedback] Email settings failed", error);
    return Response.json({ error: "Booking Experience Feedback settings could not be loaded." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireActiveStaff(request);
  if (auth.error || !auth.serviceClient || !auth.staffProfile || !auth.user) return auth.error;
  if (!canManage(auth.staffProfile)) {
    return Response.json({ error: "Communications management access is required." }, { status: 403 });
  }
  try {
    const body = (await request.json().catch(() => null)) as { template?: Partial<PlatformFeedbackEmailTemplate> } | null;
    const validation = validatePlatformFeedbackEmailTemplate(body?.template ?? {});
    if ("error" in validation) return Response.json({ error: validation.error }, { status: 400 });
    const before = await loadPlatformFeedbackCampaignConfiguration(auth.serviceClient);
    const { error } = await auth.serviceClient
      .from("platform_feedback_campaigns")
      .update({
        email_body: validation.value.body,
        email_cta: validation.value.cta,
        email_heading: validation.value.heading,
        email_subject: validation.value.subject,
        updated_at: new Date().toISOString(),
      })
      .eq("id", before.id);
    if (error) throw error;
    await recordAuditEvent(auth.serviceClient, auth.staffProfile, auth.user, {
      action: "platform_feedback.email_updated",
      afterValues: validation.value,
      beforeValues: before.template,
      entityId: before.id,
      entityReference: "booking-experience-feedback",
      entityType: "workflow",
      outcome: "success",
      request,
      sourceArea: "communications",
    });
    return Response.json(await payload(auth));
  } catch (error) {
    console.error("[Platform Feedback] Email settings save failed", error);
    return Response.json({ error: "The email wording could not be saved." }, { status: 500 });
  }
}
