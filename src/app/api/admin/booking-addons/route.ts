import { getBookingAddonCatalogue } from "@/lib/bookingAddons";
import {
  getAdminRoleFromName,
  requireActiveStaff,
} from "@/lib/supabase/serverAdmin";
import { rolePermissions } from "@/lib/zingaraAccess";
import { normalizeShowLocation } from "@/lib/zingaraDemo";
import {
  dietaryAddonCutoffMessage,
  getDietaryAddonOrderingState,
} from "@/lib/dietaryAddonOrdering";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireActiveStaff(request);

  if (auth.error || !auth.staffProfile || !auth.serviceClient) {
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

  const searchParams = new URL(request.url).searchParams;
  const bookingReference = searchParams.get("bookingReference")?.trim();
  let location = normalizeShowLocation(searchParams.get("location"));
  let performance: { date: string; time: string } | null = null;

  if (bookingReference) {
    const { data: booking, error: bookingError } = await auth.serviceClient
      .from("bookings")
      .select("show_id")
      .eq("booking_reference", bookingReference)
      .maybeSingle();

    if (bookingError) throw bookingError;

    if (booking?.show_id) {
      const { data: show, error: showError } = await auth.serviceClient
        .from("shows")
        .select("date,time,venue")
        .eq("id", booking.show_id)
        .maybeSingle();

      if (showError) throw showError;
      location = normalizeShowLocation(show?.venue);
      performance = show?.date && show?.time
        ? { date: show.date, time: show.time }
        : null;
    }
  }

  return Response.json(
    {
      canCustomPrice: permissions.includes("bookings:reconcile"),
      catalogue: getBookingAddonCatalogue(location),
      dietaryOrdering: performance
        ? {
            ...getDietaryAddonOrderingState(performance),
            message: dietaryAddonCutoffMessage,
          }
        : null,
      location,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
