import { createShortBookingReference } from "@/lib/zingaraDemo";
import { getServiceClient } from "@/lib/supabase/serverAdmin";

export const dynamic = "force-dynamic";

export async function POST() {
  const serviceClient = getServiceClient();

  if (!serviceClient) {
    return Response.json(
      { error: "Booking reference generation is temporarily unavailable." },
      { status: 503 },
    );
  }

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const reference = createShortBookingReference();
    const { data, error } = await serviceClient
      .from("bookings")
      .select("id")
      .eq("booking_reference", reference)
      .limit(1);

    if (error) {
      console.error("[Zingara API] Booking reference lookup failed", error);
      return Response.json(
        { error: "Booking reference could not be generated." },
        { status: 500 },
      );
    }

    if (!data?.length) {
      return Response.json({ reference });
    }
  }

  return Response.json(
    { error: "A unique booking reference could not be generated." },
    { status: 503 },
  );
}
