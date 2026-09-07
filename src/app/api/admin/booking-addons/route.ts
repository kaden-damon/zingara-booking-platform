import { bookingAddonCatalogue } from "@/lib/bookingAddons";
import {
  getAdminRoleFromName,
  requireActiveStaff,
} from "@/lib/supabase/serverAdmin";
import { rolePermissions } from "@/lib/zingaraAccess";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireActiveStaff(request);

  if (auth.error || !auth.staffProfile) {
    return auth.error;
  }

  const roleRow = Array.isArray(auth.staffProfile.roles)
    ? auth.staffProfile.roles[0]
    : auth.staffProfile.roles;
  const role = getAdminRoleFromName(roleRow?.name);
  const permissions = role ? rolePermissions[role] : [];

  if (!permissions.includes("bookings:manage")) {
    return Response.json(
      { error: "Booking management access is required." },
      { status: 403 },
    );
  }

  return Response.json(
    {
      canCustomPrice: permissions.includes("bookings:reconcile"),
      catalogue: bookingAddonCatalogue,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
