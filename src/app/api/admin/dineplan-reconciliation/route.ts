import {
  getRolePermissions,
  requireActiveStaff,
} from "@/lib/supabase/serverAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function roleOf(
  staffProfile: NonNullable<
    Awaited<ReturnType<typeof requireActiveStaff>>["staffProfile"]
  >,
) {
  return Array.isArray(staffProfile.roles)
    ? staffProfile.roles[0]
    : staffProfile.roles;
}

function canAccessLegacyDineplanHistory(
  staffProfile: NonNullable<
    Awaited<ReturnType<typeof requireActiveStaff>>["staffProfile"]
  >,
) {
  const permissions = getRolePermissions(roleOf(staffProfile));
  return (
    permissions.includes("bookings:reconcile") ||
    permissions.includes("settings:manage")
  );
}

async function retiredWorkflowResponse(request: Request) {
  const auth = await requireActiveStaff(request);
  if (auth.error || !auth.staffProfile) return auth.error;
  if (!canAccessLegacyDineplanHistory(auth.staffProfile)) {
    return Response.json({ error: "Forbidden." }, { status: 403 });
  }

  return Response.json(
    { error: "The legacy Dineplan workflow has been retired." },
    { status: 410 },
  );
}

export async function GET(request: Request) {
  return retiredWorkflowResponse(request);
}

export async function POST(request: Request) {
  return retiredWorkflowResponse(request);
}

export async function PATCH(request: Request) {
  return retiredWorkflowResponse(request);
}
