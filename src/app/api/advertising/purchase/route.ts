import {
  advertisingPurchaseDispatchAuthorized,
  getAdvertisingPurchaseEligibility,
  type AdvertisingPurchaseBooking,
  type AdvertisingPurchasePayment,
} from "@/lib/advertisingPurchase";
import { isSafeJourneyId } from "@/lib/platformTelemetry";
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit";
import { getServiceClient } from "@/lib/supabase/serverAdmin";

export const dynamic = "force-dynamic";

type PurchaseRequest = {
  bookingReference?: unknown;
  journeyId?: unknown;
};

function safeBookingReference(value: unknown) {
  return typeof value === "string" && /^[A-Z0-9-]{6,32}$/.test(value)
    ? value
    : null;
}

export async function POST(request: Request) {
  if (!advertisingPurchaseDispatchAuthorized()) {
    return Response.json({ dispatchAuthorized: false });
  }

  const serviceClient = getServiceClient();

  if (!serviceClient) {
    return Response.json({ dispatchAuthorized: true, eligible: false });
  }

  const body = (await request.json().catch(() => null)) as PurchaseRequest | null;
  const bookingReference = safeBookingReference(body?.bookingReference);
  const journeyId = typeof body?.journeyId === "string" ? body.journeyId : "";

  if (!bookingReference || !isSafeJourneyId(journeyId)) {
    return Response.json({ error: "Invalid purchase verification context." }, { status: 400 });
  }

  const rateLimit = await checkRateLimit(
    request,
    {
      limit: 20,
      scope: "advertising_purchase_verification",
      windowSeconds: 60,
    },
    [journeyId],
    serviceClient,
  );

  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.retryAfterSeconds);
  }

  const { data: booking, error: bookingError } = await serviceClient
    .from("bookings")
    .select(
      "id,booking_source,booking_origin,booking_status,payment_status,total_amount,amount_paid,balance_outstanding,guest_count,archived_at,public_checkout_journey_id",
    )
    .eq("booking_reference", bookingReference)
    .eq("public_checkout_journey_id", journeyId)
    .maybeSingle();

  if (bookingError || !booking) {
    return Response.json({ dispatchAuthorized: true, eligible: false });
  }

  const { data: payments, error: paymentError } = await serviceClient
    .from("payments")
    .select("amount,payment_status,provider_transaction_id")
    .eq("booking_id", booking.id)
    .not("provider_transaction_id", "is", null)
    .limit(12);

  if (paymentError) {
    return Response.json({ dispatchAuthorized: true, eligible: false });
  }

  const eligibility = getAdvertisingPurchaseEligibility({
    booking: booking as AdvertisingPurchaseBooking,
    journeyId,
    payments: (payments ?? []) as AdvertisingPurchasePayment[],
  });

  return Response.json(
    eligibility.eligible
      ? {
          conversion: eligibility.payload,
          dispatchAuthorized: true,
          eligible: true,
        }
      : { dispatchAuthorized: true, eligible: false },
    {
      headers: {
        "Cache-Control": "no-store, private",
      },
    },
  );
}
