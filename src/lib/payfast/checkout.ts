import { getPayFastConfig } from "@/lib/payfast/config";
import {
  createPayFastPaymentData,
  createPayFastResultUrl,
  getPayFastPaymentFormAction,
} from "@/lib/payfast/payment";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DemoBooking } from "@/lib/zingaraDemo";

export type PayFastCheckoutPayload = {
  amount?: number;
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
  booking_id?: string;
  booking_status?: string;
  payment_id?: string;
  payment_status?: string;
  reason?: string;
  status?: "blocked" | "missing" | "ready";
};

export type CheckoutBookingRow = {
  balance_outstanding: number | null;
  notes: string | null;
  total_amount: number | null;
};

const bookingMetadataPrefix = "__zingara_booking_meta__:";

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

function parseBookingMetadata(notes: string | null) {
  if (!notes?.startsWith(bookingMetadataPrefix)) {
    return null;
  }

  try {
    return JSON.parse(notes.slice(bookingMetadataPrefix.length)) as DemoBooking;
  } catch {
    return null;
  }
}

export async function getAuthoritativeCheckoutAmount(
  serviceClient: SupabaseClient,
  bookingReference: string,
) {
  const { data, error } = await serviceClient
    .from("bookings")
    .select("balance_outstanding,total_amount,notes")
    .eq("booking_reference", bookingReference)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const row = data as CheckoutBookingRow | null;
  const metadata = parseBookingMetadata(row?.notes ?? null);
  const balanceOutstanding = Math.max(Number(row?.balance_outstanding) || 0, 0);
  const totalAmount = Math.max(Number(row?.total_amount) || 0, 0);

  if (
    metadata?.paymentOption === "deposit" &&
    typeof metadata.depositPercentage === "number" &&
    metadata.depositPercentage > 0
  ) {
    return Math.min(
      balanceOutstanding || totalAmount,
      Math.round(totalAmount * (metadata.depositPercentage / 100)),
    );
  }

  return balanceOutstanding || totalAmount;
}

export async function preparePayFastCheckoutAttempt(
  serviceClient: SupabaseClient,
  payload: PayFastCheckoutPayload,
) {
  const { data: attemptData, error: attemptError } =
    await serviceClient.rpc("prepare_payfast_checkout_attempt", {
      p_amount: payload.amount,
      p_booking_reference: payload.bookingReference,
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

  if (authoritativeAmount <= 0) {
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
      amount: authoritativeAmount,
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
    fields: paymentData,
    mode: payFastConfig.mode,
    status: 200,
  };
}
