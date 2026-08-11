import {
  getAdminRoleFromName,
  requireActiveStaff,
} from "@/lib/supabase/serverAdmin";
import { runAutomatedWorkflowDryRun } from "@/lib/workflows/automatedWorkflows";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function getStaffRole(
  staffProfile: NonNullable<
    Awaited<ReturnType<typeof requireActiveStaff>>["staffProfile"]
  >,
) {
  const role = Array.isArray(staffProfile.roles)
    ? staffProfile.roles[0]
    : staffProfile.roles;

  return getAdminRoleFromName(role?.name);
}

export async function GET(request: Request) {
  const auth = await requireActiveStaff(request);

  if (auth.error || !auth.serviceClient || !auth.staffProfile) {
    return auth.error;
  }

  const role = getStaffRole(auth.staffProfile);

  if (role !== "super-admin") {
    return Response.json(
      { error: "Automated workflow dry-run is restricted to Super Admin." },
      { status: 403 },
    );
  }

  try {
    const result = await runAutomatedWorkflowDryRun(auth.serviceClient);

    return Response.json({
      ...result,
      emailDispatch: "disabled",
    });
  } catch (error) {
    console.error("[Zingara Workflows] Admin workflow dry-run failed", error);

    return Response.json(
      { error: "Workflow dry-run could not complete." },
      { status: 500 },
    );
  }
}
