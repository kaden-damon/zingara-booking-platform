import { getAdminRoleFromName, requireActiveStaff } from "@/lib/supabase/serverAdmin";
import { recordAuditEvent } from "@/lib/supabase/serverAudit";
import { loadReviewManagementConfiguration, previewReviewManagement, saveReviewManagementConfiguration } from "@/lib/workflows/reviewManagement";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function roleOf(profile: NonNullable<Awaited<ReturnType<typeof requireActiveStaff>>["staffProfile"]>) {
  const role = Array.isArray(profile.roles) ? profile.roles[0] : profile.roles;
  return getAdminRoleFromName(role?.name);
}

async function requireSuperAdmin(request: Request) {
  const auth = await requireActiveStaff(request);
  if (auth.error || !auth.serviceClient || !auth.staffProfile) return { auth, error: auth.error };
  if (roleOf(auth.staffProfile) !== "super-admin") return { auth, error: Response.json({ error: "Review notification configuration is restricted to Super Admin." }, { status: 403 }) };
  return { auth, error: null };
}

export async function GET(request: Request) {
  const access = await requireSuperAdmin(request);
  if (access.error) return access.error;
  try { return Response.json(await previewReviewManagement(access.auth.serviceClient!)); }
  catch (error) { console.error("[Review Management] Preview failed", error); return Response.json({ error: "Review notification preview could not be loaded." }, { status: 500 }); }
}

export async function PUT(request: Request) {
  const access = await requireSuperAdmin(request);
  if (access.error) return access.error;
  try {
    const before = await loadReviewManagementConfiguration(access.auth.serviceClient!);
    const body = await request.json();
    const after = await saveReviewManagementConfiguration(access.auth.serviceClient!, body, access.auth.user?.id ?? null);
    await recordAuditEvent(access.auth.serviceClient!, access.auth.staffProfile!, access.auth.user, {
      action: "workflow.review-management.configuration-updated", afterValues: after, beforeValues: before,
      changedFields: ["immediateEnabled", "dailyEnabled", "dailyTime", "immediateRecipientStaffIds", "dailyRecipientStaffIds"],
      entityReference: "review-management", entityType: "workflow", outcome: "success", request, sourceArea: "Automated Workflows",
    });
    return Response.json({ configuration: after });
  } catch (error) {
    console.error("[Review Management] Save failed", error);
    return Response.json({ error: error instanceof Error ? error.message : "Review notifications could not be saved." }, { status: 400 });
  }
}
