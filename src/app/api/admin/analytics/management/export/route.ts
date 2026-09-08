import { getRolePermissions, requireActiveStaff } from "@/lib/supabase/serverAdmin";
import { tryRecordAuditEvent } from "@/lib/supabase/serverAudit";

export const dynamic = "force-dynamic";

function roleOf(
  profile: NonNullable<
    Awaited<ReturnType<typeof requireActiveStaff>>["staffProfile"]
  >,
) {
  return Array.isArray(profile.roles) ? profile.roles[0] : profile.roles;
}

export async function GET(request: Request) {
  const auth = await requireActiveStaff(request);

  if (auth.error || !auth.serviceClient || !auth.staffProfile || !auth.user) {
    return auth.error ?? Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!getRolePermissions(roleOf(auth.staffProfile)).includes("analytics:read")) {
    return Response.json(
      { error: "Analytics access is required." },
      { status: 403 },
    );
  }

  await tryRecordAuditEvent(auth.serviceClient, auth.staffProfile, auth.user, {
    action: "analytics.management_export.blocked",
    entityReference: "management-analytics",
    entityType: "data-portability-export",
    outcome: "blocked",
    reason: "Broad management data export is disabled.",
    request,
    sourceArea: "Management Analytics",
  });

  return Response.json(
    { error: "Management data export is disabled." },
    { status: 403 },
  );
}
