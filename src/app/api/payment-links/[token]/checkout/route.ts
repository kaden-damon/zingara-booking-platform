import {
  createPayFastCheckoutForBookingLink,
  expirePaymentLink,
  getPaymentLinkCheckoutAmount,
  isBookingPaymentLinkEligible,
  loadActivePaymentLink,
  loadBookingForPaymentLink,
  loadCustomerForPaymentLink,
} from "@/lib/payment-links/customerPaymentLinks";
import { preparePayFastCheckoutAttempt } from "@/lib/payfast/checkout";
import { getServiceClient } from "@/lib/supabase/serverAdmin";
import { requirePublicMaintenanceAvailable } from "@/lib/platformMaintenance";

export const dynamic = "force-dynamic";

type PaymentLinkCheckoutContext = {
  params: Promise<{
    token: string;
  }>;
};

function isMissingPaymentLinkTable(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    ((error as { code?: string }).code === "42P01" ||
      (error as { code?: string }).code === "PGRST205")
  );
}

function getHttpErrorStatus(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof (error as { status?: unknown }).status === "number"
  ) {
    return (error as { status: number }).status;
  }

  return 500;
}

export async function POST(_request: Request, context: PaymentLinkCheckoutContext) {
  const { token } = await context.params;
  const supabase = getServiceClient();

  if (!supabase) {
    return Response.json(
      { error: "Payment checkout is temporarily unavailable." },
      { status: 503 },
    );
  }

  const maintenanceResponse = await requirePublicMaintenanceAvailable(
    supabase,
    "payment",
  );

  if (maintenanceResponse) return maintenanceResponse;

  try {
    const link = await loadActivePaymentLink(
      supabase,
      decodeURIComponent(token),
    );

    if (!link || link.status !== "active") {
      return Response.json(
        { error: "This payment link is invalid or has expired." },
        { status: 404 },
      );
    }

    if (new Date(link.expires_at).getTime() <= Date.now()) {
      await expirePaymentLink(supabase, link.id);

      return Response.json(
        { error: "This payment link has expired." },
        { status: 410 },
      );
    }

    const booking = await loadBookingForPaymentLink(
      supabase,
      link.booking_reference,
    );

    if (!booking || booking.id !== link.booking_id) {
      return Response.json(
        { error: "This payment link is no longer valid." },
        { status: 404 },
      );
    }

    if (!isBookingPaymentLinkEligible(booking)) {
      return Response.json(
        { error: "This booking is no longer awaiting payment." },
        { status: 409 },
      );
    }

    const paymentAmount = getPaymentLinkCheckoutAmount(link, booking);
    let preparedAmount = paymentAmount;

    if (paymentAmount > 0) {
      const attempt = await preparePayFastCheckoutAttempt(supabase, {
        amount: paymentAmount,
        bookingReference: booking.booking_reference,
      });

      if ("error" in attempt) {
        return Response.json(
          { error: attempt.error },
          { status: attempt.status },
        );
      }

      preparedAmount = attempt.attempt.booking_applied_amount ?? paymentAmount;
    }

    const customer = await loadCustomerForPaymentLink(
      supabase,
      booking.customer_id,
    );
    const checkout = await createPayFastCheckoutForBookingLink(
      supabase,
      booking,
      customer,
      preparedAmount,
    );

    if (checkout.status === "already_paid") {
      await supabase
        .from("booking_payment_links")
        .update({
          status: "used",
          updated_at: new Date().toISOString(),
          used_at: new Date().toISOString(),
        })
        .eq("id", link.id)
        .eq("status", "active");
    }

    return Response.json(checkout);
  } catch (error) {
    console.error("[Zingara Payment Link] Checkout failed", error);

    if (isMissingPaymentLinkTable(error)) {
      return Response.json(
        { error: "Payment links are not configured yet." },
        { status: 503 },
      );
    }

    const status = getHttpErrorStatus(error);

    return Response.json(
      {
        error:
          status === 503
            ? "PayFast checkout is not configured."
            : "Payment checkout could not be prepared.",
      },
      { status },
    );
  }
}
