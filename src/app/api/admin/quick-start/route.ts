import { canProcessRefund } from "@/lib/refundAuthorization";
import { getStaffVenueScopeLabel } from "@/lib/staffLocations";
import {
  getAdminRoleFromName,
  getRolePermissions,
  isSuperAdminProfile,
  requireActiveStaff,
} from "@/lib/supabase/serverAdmin";
import { adminRoleLabels } from "@/lib/zingaraAccess";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireActiveStaff(request);

  if (auth.error || !auth.staffProfile) {
    return (
      auth.error ??
      Response.json({ error: "An active staff profile is required." }, { status: 403 })
    );
  }

  const roleRow = Array.isArray(auth.staffProfile.roles)
    ? auth.staffProfile.roles[0]
    : auth.staffProfile.roles;
  const role = getAdminRoleFromName(roleRow?.name);

  return Response.json(
    {
      staff: {
        canProcessRefund: canProcessRefund(
          auth.staffProfile,
          isSuperAdminProfile(auth.staffProfile),
        ),
        locationLabel: getStaffVenueScopeLabel(
          auth.staffProfile.venue_scope ?? [],
        ),
        name: auth.staffProfile.full_name,
        permissions: getRolePermissions(roleRow),
        role,
        roleLabel: roleRow?.name ?? adminRoleLabels[role],
      },
    },
    {
      headers: {
        "Cache-Control": "private, no-store",
      },
    },
  );
}
