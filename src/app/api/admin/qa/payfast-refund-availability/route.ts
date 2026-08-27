import { getPayFastConfig } from "@/lib/payfast/config";
import { queryPayFastRefundAvailability } from "@/lib/payfast/refunds";
import {
  isSuperAdminProfile,
  requireActiveStaff,
} from "@/lib/supabase/serverAdmin";

export const dynamic = "force-dynamic";

const qaBookingReference = "ZNG-QBZTTF";
const qaRefundAmount = 10;

function getSafeBlockingReason(input: {
  fullRefundAvailable: boolean;
  method: "bank_payout" | "not_available" | "payment_source" | "unknown";
  providerState: "not_available" | "refundable" | "refunded" | "unknown";
  refundable: boolean;
}) {
  if (input.providerState === "refunded") {
    return "PayFast reports that this transaction has already been refunded.";
  }

  if (!input.refundable) {
    return "PayFast does not conclusively report this transaction as refundable.";
  }

  if (!input.fullRefundAvailable) {
    return "PayFast does not report the full R10 amount as available for refund.";
  }

  if (input.method === "bank_payout") {
    return "PayFast requires a manual bank-payout refund for this transaction.";
  }

  if (input.method !== "payment_source") {
    return "PayFast did not return PAYMENT_SOURCE as the full-refund method.";
  }

  return null;
}

export async function GET(request: Request) {
  const auth = await requireActiveStaff(request);

  if (auth.error || !auth.serviceClient || !auth.staffProfile) {
    return (
      auth.error ?? Response.json({ error: "Unauthorized." }, { status: 401 })
    );
  }

  if (!isSuperAdminProfile(auth.staffProfile)) {
    return Response.json(
      { error: "Super Admin access is required." },
      { status: 403 },
    );
  }

  const { data: booking, error: bookingError } = await auth.serviceClient
    .from("bookings")
    .select(
      "id,booking_reference,booking_status,payment_status,total_amount,amount_paid,balance_outstanding",
    )
    .eq("booking_reference", qaBookingReference)
    .maybeSingle();

  if (bookingError || !booking) {
    return Response.json(
      { error: "The fixed PayFast refund QA booking could not be resolved." },
      { status: 404 },
    );
  }

  if (
    booking.booking_status !== "confirmed" ||
    booking.payment_status !== "fully_paid" ||
    Math.abs(Number(booking.total_amount) - qaRefundAmount) > 0.01 ||
    Math.abs(Number(booking.amount_paid) - qaRefundAmount) > 0.01 ||
    Number(booking.balance_outstanding) > 0.01
  ) {
    return Response.json(
      { error: "The fixed PayFast refund QA booking is no longer eligible." },
      { status: 409 },
    );
  }

  const [paymentResult, refundResult] = await Promise.all([
    auth.serviceClient
      .from("payments")
      .select("amount,provider_transaction_id")
      .eq("booking_id", booking.id)
      .eq("method", "payfast")
      .not("provider_transaction_id", "is", null)
      .gt("amount", 0),
    auth.serviceClient
      .from("payment_refunds")
      .select("id")
      .eq("booking_id", booking.id)
      .limit(1),
  ]);

  if (paymentResult.error || refundResult.error) {
    return Response.json(
      { error: "PayFast refund eligibility could not be confirmed." },
      { status: 500 },
    );
  }

  const payments = paymentResult.data ?? [];

  if (
    payments.length !== 1 ||
    !payments[0].provider_transaction_id ||
    Math.abs(Number(payments[0].amount) - qaRefundAmount) > 0.01
  ) {
    return Response.json(
      { error: "The fixed booking no longer has one proven R10 PayFast payment." },
      { status: 409 },
    );
  }

  if ((refundResult.data ?? []).length > 0) {
    return Response.json(
      { error: "The fixed booking now has refund history and cannot be queried by this QA control." },
      { status: 409 },
    );
  }

  const config = getPayFastConfig();

  if (!config.configured || config.mode !== "live") {
    return Response.json(
      { error: "Production PayFast configuration is not ready for this query." },
      { status: 503 },
    );
  }

  try {
    const availability = await queryPayFastRefundAvailability(
      payments[0].provider_transaction_id,
      config,
    );
    const fullRefundAvailable =
      availability.refundable &&
      availability.amountAvailable + 0.001 >= qaRefundAmount;
    const blockingReason = getSafeBlockingReason({
      fullRefundAvailable,
      method: availability.fullRefundMethod,
      providerState: availability.providerState,
      refundable: availability.refundable,
    });

    return Response.json({
      fullRefundAvailable,
      providerState: availability.providerState,
      querySucceeded: true,
      reason: blockingReason,
      refundable: availability.refundable,
      refundFullMethod: availability.fullRefundMethod.toUpperCase(),
    });
  } catch {
    return Response.json(
      {
        fullRefundAvailable: false,
        providerState: "unknown",
        querySucceeded: false,
        reason: "PayFast refund availability could not be confirmed.",
        refundable: false,
        refundFullMethod: "UNKNOWN",
      },
      { status: 502 },
    );
  }
}
