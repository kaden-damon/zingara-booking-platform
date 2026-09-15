import { getServiceClient } from "@/lib/supabase/serverAdmin";
import { runPublicPaymentHoldCleanup } from "@/lib/workflows/publicPaymentHolds";
import { loadPublicShowAvailability } from "@/lib/supabase/publicShowAvailability";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const showId = new URL(request.url).searchParams.get("showId")?.trim();

  if (!showId) {
    return Response.json({ error: "Show ID is required." }, { status: 400 });
  }

  const serviceClient = getServiceClient();

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
    return Response.json(await loadPublicShowAvailability(serviceClient, showId));
  } catch (error) {
    console.error("[Zingara API] Failed to load show availability", error);
    return Response.json({ error: "Show availability could not be loaded." }, { status: 500 });
  }
}
