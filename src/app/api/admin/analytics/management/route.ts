import { getRolePermissions, requireActiveStaff } from "@/lib/supabase/serverAdmin";
import { loadManagementAnalyticsDataset } from "@/lib/supabase/managementAnalyticsServer";

export const dynamic = "force-dynamic";

function getRole(profile: NonNullable<Awaited<ReturnType<typeof requireActiveStaff>>["staffProfile"]>) {
  return Array.isArray(profile.roles) ? profile.roles[0] : profile.roles;
}

export async function GET(request: Request) {
  const auth = await requireActiveStaff(request);

  if (auth.error || !auth.serviceClient || !auth.staffProfile) {
    return auth.error ?? Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!getRolePermissions(getRole(auth.staffProfile)).includes("analytics:read")) {
    return Response.json(
      { error: "Analytics access is required." },
      { status: 403 },
    );
  }

  try {
    const dataset = await loadManagementAnalyticsDataset(
      auth.serviceClient,
      auth.staffProfile.venue_scope,
    );

    return Response.json(
      { dataset },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("[Zingara Analytics] Management dataset failed", error);
    return Response.json(
      { error: "Management analytics could not be loaded." },
      { status: 500 },
    );
  }
}
