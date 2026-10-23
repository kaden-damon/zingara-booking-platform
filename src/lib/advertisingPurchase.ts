import { createHash } from "node:crypto";

export type AdvertisingPurchaseBooking = {
  amount_paid: number | null;
  archived_at: string | null;
  balance_outstanding: number | null;
  booking_origin: string | null;
  booking_source: string | null;
  booking_status: string;
  guest_count: number | null;
  id: string;
  payment_status: string;
  public_checkout_journey_id: string | null;
  total_amount: number | null;
};

export type AdvertisingPurchasePayment = {
  amount: number | null;
  payment_status: string;
  provider_transaction_id: string | null;
};

export type AdvertisingPurchasePayload = {
  currency: "ZAR";
  eventId: string;
  guestCount: number;
  transactionId: string;
  value: number;
};

export type AdvertisingPurchaseEligibility =
  | { eligible: false; reason: string }
  | { eligible: true; payload: AdvertisingPurchasePayload };

function money(value: number | null) {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
}

function isSafePublicJourneyId(value: unknown) {
  return typeof value === "string" && /^journey_[a-zA-Z0-9_-]{12,80}$/.test(value);
}

export function createAdvertisingTransactionId(
  bookingId: string,
) {
  const digest = createHash("sha256")
    .update(`zingara-ad-purchase-v1:${bookingId}`)
    .digest("hex")
    .slice(0, 32);

  return `zingara_${digest}`;
}

export function getAdvertisingPurchaseEligibility(input: {
  booking: AdvertisingPurchaseBooking;
  journeyId: string;
  payments: AdvertisingPurchasePayment[];
}): AdvertisingPurchaseEligibility {
  const { booking, journeyId, payments } = input;
  const value = money(booking.total_amount);
  const amountPaid = money(booking.amount_paid);
  const balance = money(booking.balance_outstanding);

  if (
    !isSafePublicJourneyId(journeyId) ||
    booking.public_checkout_journey_id !== journeyId
  ) {
    return { eligible: false, reason: "journey_mismatch" };
  }

  if (
    booking.booking_source !== "online" ||
    booking.booking_origin !== "customer_public"
  ) {
    return { eligible: false, reason: "not_public_checkout" };
  }

  if (
    booking.archived_at ||
    !["confirmed", "checked_in", "completed"].includes(booking.booking_status)
  ) {
    return { eligible: false, reason: "booking_not_active" };
  }

  if (
    booking.payment_status !== "fully_paid" ||
    value <= 0 ||
    amountPaid + 0.009 < value ||
    balance > 0.009
  ) {
    return { eligible: false, reason: "payment_not_complete" };
  }

  const verifiedPayFastTotal = money(
    payments
      .filter(
        (payment) =>
          payment.provider_transaction_id?.trim() &&
          ["deposit_paid", "fully_paid"].includes(payment.payment_status),
      )
      .reduce((total, payment) => total + money(payment.amount), 0),
  );

  if (verifiedPayFastTotal + 0.009 < value) {
    return { eligible: false, reason: "provider_evidence_incomplete" };
  }

  const transactionId = createAdvertisingTransactionId(booking.id);

  return {
    eligible: true,
    payload: {
      currency: "ZAR",
      eventId: transactionId,
      guestCount: Math.max(1, Math.round(Number(booking.guest_count) || 1)),
      transactionId,
      value,
    },
  };
}

export function advertisingPurchaseDispatchAuthorized() {
  return process.env.ADVERTISING_PURCHASE_CONVERSIONS_AUTHORISED === "true";
}
