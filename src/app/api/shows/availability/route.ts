import { getServiceClient } from "@/lib/supabase/serverAdmin";
import {
  getRolePermissions,
  requireActiveStaff,
} from "@/lib/supabase/serverAdmin";
import { runPublicPaymentHoldCleanup } from "@/lib/workflows/publicPaymentHolds";
import { loadPublicShowAvailability } from "@/lib/supabase/publicShowAvailability";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const showId = searchParams.get("showId")?.trim();
  const capacityScope = searchParams.get("capacityScope") === "operational"
    ? "operational"
    : "base";

  if (!showId) {
    return Response.json({ error: "Show ID is required." }, { status: 400 });
  }

  let serviceClient = getServiceClient();

  if (capacityScope === "operational") {
    const auth = await requireActiveStaff(request);
    if (auth.error || !auth.serviceClient || !auth.staffProfile) {
      return auth.error ?? Response.json({ error: "Active staff access is required." }, { status: 403 });
    }
    const role = Array.isArray(auth.staffProfile.roles)
      ? auth.staffProfile.roles[0]
      : auth.staffProfile.roles;
    if (!getRolePermissions(role).includes("bookings:manage")) {
      return Response.json(
        { error: "Booking management access is required." },
        { status: 403 },
      );
    }
    serviceClient = auth.serviceClient;
  }

  if (!serviceClient) {
    return Response.json(
      { error: "Show availability is temporarily unavailable." },
      { status: 503 },
    );
  }

  try {
    await runPublicPaymentHoldCleanup(serviceClient);
  } catch (error) {
    console.error("[Zingara API] Public payment hold cleanup failed", error);
  }

  try {
    return Response.json(
      await loadPublicShowAvailability(serviceClient, showId, { capacityScope }),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("[Zingara API] Failed to load show availability", error);
    return Response.json({ error: "Show availability could not be loaded." }, { status: 500 });
  }
}
