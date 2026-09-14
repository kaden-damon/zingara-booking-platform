import { getRolePermissions, requireActiveStaff } from "@/lib/supabase/serverAdmin";
import { loadPotentialDuplicateGroups } from "@/lib/supabase/duplicateIntegrityServer";

export const dynamic = "force-dynamic";

function getRole(
  profile: NonNullable<
    Awaited<ReturnType<typeof requireActiveStaff>>["staffProfile"]
  >,
) {
  return Array.isArray(profile.roles) ? profile.roles[0] : profile.roles;
}

export async function GET(request: Request) {
  const auth = await requireActiveStaff(request);

  if (auth.error || !auth.serviceClient || !auth.staffProfile) {
    return auth.error ?? Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!getRolePermissions(getRole(auth.staffProfile)).includes("bookings:manage")) {
    return Response.json(
      { error: "Booking management access is required." },
      { status: 403 },
    );
  }

  try {
    const groups = await loadPotentialDuplicateGroups(
      auth.serviceClient,
      auth.staffProfile.venue_scope,
    );

    return Response.json(
      {
        groups,
        summary: {
          capacityImpact: groups.reduce(
            (total, group) => total + group.capacityImpact,
            0,
          ),
          exact: groups.filter((group) => group.confidence === "exact").length,
          possible: groups.filter((group) => group.confidence === "possible").length,
          probable: groups.filter((group) => group.confidence === "probable").length,
          total: groups.length,
        },
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("[Zingara Duplicate Integrity] Review dataset failed", error);
    return Response.json(
      { error: "Potential duplicates could not be loaded." },
      { status: 500 },
    );
  }
}
