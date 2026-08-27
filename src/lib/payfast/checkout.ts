import { getPayFastConfig } from "@/lib/payfast/config";
import {
  createPayFastPaymentData,
  createPayFastResultUrl,
  getPayFastPaymentFormAction,
} from "@/lib/payfast/payment";
import type { SupabaseClient } from "@supabase/supabase-js";
import { calculateOutstandingAmount } from "@/lib/paymentControls";
import { calculatePayFastTransactionAmounts } from "@/lib/payfast/transactionFee";

export type PayFastCheckoutPayload = {
  amount?: number;
  preparedAmount?: number;
  bookingReference: string;
  customer?: {
    email?: string;
    name?: string;
    phone?: string;
  };
  itemDescription?: string;
  itemName?: string;
  section?: string;
};

export type CheckoutAttemptResult = {
  amount_due?: number;
  booking_applied_amount?: number;
  booking_id?: string;
  booking_status?: string;
  payment_id?: string;
  payment_status?: string;
  provider_gross_amount?: number;
  reason?: string;
  status?: "blocked" | "missing" | "ready";
  transaction_fee_amount?: number;
};

export type CheckoutBookingRow = {
  amount_paid: number | null;
  total_amount: number | null;
};

function splitName(name: string | undefined) {
  const trimmedName = name?.trim() ?? "";
  const [firstName = "", ...surnameParts] = trimmedName.split(/\s+/);

  return {
    firstName,
    lastName: surnameParts.join(" "),
  };
}

function normalizePhone(phone: string | undefined) {
  return phone?.replace(/[^\d+]/g, "") || undefined;
}

export async function getAuthoritativeCheckoutAmount(
  serviceClient: SupabaseClient,
  bookingReference: string,
) {
  const { data, error } = await serviceClient
    .from("bookings")
    .select("amount_paid,total_amount")
    .eq("booking_reference", bookingReference)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const row = data as CheckoutBookingRow | null;
  return calculateOutstandingAmount(row?.total_amount, row?.amount_paid);
}

export async function preparePayFastCheckoutAttempt(
  serviceClient: SupabaseClient,
  payload: PayFastCheckoutPayload,
) {
  const transaction = calculatePayFastTransactionAmounts(payload.amount);
  const { data: attemptData, error: attemptError } =
    await serviceClient.rpc("prepare_payfast_checkout_attempt", {
      p_amount: transaction.bookingAppliedAmount,
      p_booking_reference: payload.bookingReference,
      p_transaction_fee: transaction.transactionFeeAmount,
    });

  if (attemptError) {
    throw attemptError;
  }

  const attempt = attemptData as CheckoutAttemptResult | null;

  if (attempt?.status === "missing") {
    return {
      error: "Booking could not be found for payment.",
      status: 404,
    };
  }

  if (attempt?.status === "blocked") {
    return {
      error:
        attempt.reason === "booking-not-payable"
          ? "This booking is no longer awaiting payment."
          : "This payment is no longer awaiting checkout.",
      status: 409,
    };
  }

  if (attempt?.status !== "ready") {
    return {
      error: "PayFast checkout could not be prepared.",
      status: 409,
    };
  }

  if (
    typeof attempt.amount_due === "number" &&
    attempt.amount_due > 0 &&
    typeof payload.amount === "number" &&
    payload.amount - attempt.amount_due > 0.01
  ) {
    return {
      error: "Payment amount exceeds the outstanding balance.",
      status: 409,
    };
  }

  return {
    attempt,
    status: 200,
  };
}

export async function createExistingBookingPayFastCheckout(
  serviceClient: SupabaseClient,
  payload: PayFastCheckoutPayload,
) {
  const authoritativeAmount = await getAuthoritativeCheckoutAmount(
    serviceClient,
    payload.bookingReference,
  );
  const checkoutAmount =
    typeof payload.preparedAmount === "number" && payload.preparedAmount > 0
      ? payload.preparedAmount
      : authoritativeAmount;
  const transaction = calculatePayFastTransactionAmounts(checkoutAmount);

  if (checkoutAmount <= 0 || checkoutAmount - authoritativeAmount > 0.01) {
    return {
      error: "This booking has no payable balance.",
      status: 409,
    };
  }

  const config = getPayFastConfig();
  if (!config.configured) {
    return {
      error: "PayFast checkout is not configured.",
      status: 503,
    };
  }

  const payFastConfig = {
    ...config,
    cancelUrl: createPayFastResultUrl(
      config.cancelUrl,
      "cancelled",
      payload.bookingReference,
    ),
    notifyUrl: config.notifyUrl,
    returnUrl: createPayFastResultUrl(
      config.returnUrl,
      "return",
      payload.bookingReference,
    ),
  };
  const { firstName, lastName } = splitName(payload.customer?.name);
  const paymentData = createPayFastPaymentData(
    {
      amount: transaction.providerGrossAmount,
      cellNumber: normalizePhone(payload.customer?.phone),
      customString1: payload.bookingReference,
      customString2: payload.section,
      emailAddress: payload.customer?.email,
      itemDescription:
        payload.itemDescription ??
        `Zingara booking ${payload.bookingReference}`,
      itemName: payload.itemName ?? "The Royal Countess Zingara Booking",
      merchantPaymentId: payload.bookingReference,
      nameFirst: firstName,
      nameLast: lastName,
    },
    payFastConfig,
  );

  return {
    actionUrl: getPayFastPaymentFormAction(payFastConfig),
    bookingAppliedAmount: transaction.bookingAppliedAmount,
    fields: paymentData,
    mode: payFastConfig.mode,
    providerGrossAmount: transaction.providerGrossAmount,
    status: 200,
    transactionFeeAmount: transaction.transactionFeeAmount,
  };
}
