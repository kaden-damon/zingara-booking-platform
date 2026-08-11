import { getPayFastConfig } from "@/lib/payfast/config";
import {
  createPayFastPaymentData,
  createPayFastResultUrl,
  getPayFastPaymentFormAction,
} from "@/lib/payfast/payment";
import {
  recordPlatformEventBestEffort,
  recordPlatformFailureEventBestEffort,
  recoverPlatformIncidentBestEffort,
} from "@/lib/platformTelemetry";
import {
  checkRateLimit,
  rateLimitResponse,
} from "@/lib/rateLimit";
import { getServiceClient } from "@/lib/supabase/serverAdmin";
import type { DemoBooking } from "@/lib/zingaraDemo";

export const dynamic = "force-dynamic";

type PayFastCheckoutRequest = {
  amount?: number;
  bookingReference?: string;
  customer?: {
    email?: string;
    name?: string;
    phone?: string;
  };
  itemDescription?: string;
  itemName?: string;
  journeyId?: string | null;
  section?: string;
};

type CheckoutAttemptResult = {
  amount_due?: number;
  booking_id?: string;
  booking_status?: string;
  payment_id?: string;
  payment_status?: string;
  reason?: string;
  status?: "blocked" | "missing" | "ready";
};

type CheckoutBookingRow = {
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

async function getAuthoritativeCheckoutAmount(
  serviceClient: NonNullable<ReturnType<typeof getServiceClient>>,
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

export async function POST(request: Request) {
  const startedAt = Date.now();

  try {
    const body = (await request.json()) as PayFastCheckoutRequest;

    if (!body.bookingReference || !body.amount || body.amount <= 0) {
      return Response.json(
        { error: "A booking reference and positive amount are required." },
        { status: 400 },
      );
    }

    const serviceClient = getServiceClient();

    if (!serviceClient) {
      return Response.json(
        { error: "Payment checkout is not configured." },
        { status: 503 },
      );
    }

    const ipLimit = await checkRateLimit(
      request,
      {
        limit: 30,
        scope: "payfast_checkout_ip",
        windowSeconds: 60,
      },
      [],
      serviceClient,
    );

    if (!ipLimit.allowed) {
      return rateLimitResponse(
        ipLimit.retryAfterSeconds,
        {
          bookingReference: body.bookingReference,
          journeyId: body.journeyId ?? null,
          metadata: {
            section: body.section ?? null,
            source: "online",
          },
          operation: "prepare_payfast_checkout",
          route: "/api/payfast/checkout",
          safeFingerprint: "payfast_checkout_rate_limited_ip",
        },
        serviceClient,
      );
    }

    const referenceLimit = await checkRateLimit(
      request,
      {
        limit: 8,
        scope: "payfast_checkout_reference",
        windowSeconds: 300,
      },
      [body.bookingReference],
      serviceClient,
    );

    if (!referenceLimit.allowed) {
      return rateLimitResponse(
        referenceLimit.retryAfterSeconds,
        {
          bookingReference: body.bookingReference,
          journeyId: body.journeyId ?? null,
          metadata: {
            section: body.section ?? null,
            source: "online",
          },
          operation: "prepare_payfast_checkout",
          route: "/api/payfast/checkout",
          safeFingerprint: "payfast_checkout_rate_limited_reference",
        },
        serviceClient,
      );
    }

    const { data: attemptData, error: attemptError } =
      await serviceClient.rpc("prepare_payfast_checkout_attempt", {
        p_amount: body.amount,
        p_booking_reference: body.bookingReference,
      });

    if (attemptError) {
      console.error(
        "[Zingara PayFast] Checkout attempt guard failed",
        attemptError,
      );
      recordPlatformFailureEventBestEffort(
        {
          bookingReference: body.bookingReference,
          journeyId: body.journeyId ?? null,
          metadata: {
            section: body.section ?? null,
            source: "online",
          },
          operation: "prepare_payfast_checkout",
          route: "/api/payfast/checkout",
          safeFingerprint: "payfast_checkout_unavailable",
          service: "PAYFAST CHECKOUT",
          statusCode: 500,
          summary: "PayFast checkout preparation failures are recurring.",
        },
        serviceClient,
      );

      return Response.json(
        { error: "PayFast checkout could not be prepared." },
        { status: 500 },
      );
    }

    const attempt = attemptData as CheckoutAttemptResult | null;

    if (attempt?.status === "missing") {
      return Response.json(
        { error: "Booking could not be found for payment." },
        { status: 404 },
      );
    }

    if (attempt?.status === "blocked") {
      return Response.json(
        {
          error:
            attempt.reason === "booking-not-payable"
              ? "This booking is no longer awaiting payment."
              : "This payment is no longer awaiting checkout.",
        },
        { status: 409 },
      );
    }

    if (attempt?.status !== "ready") {
      return Response.json(
        { error: "PayFast checkout could not be prepared." },
        { status: 409 },
      );
    }

    if (
      typeof attempt.amount_due === "number" &&
      attempt.amount_due > 0 &&
      body.amount - attempt.amount_due > 0.01
    ) {
      return Response.json(
        { error: "Payment amount exceeds the outstanding balance." },
        { status: 409 },
      );
    }

    const authoritativeAmount = await getAuthoritativeCheckoutAmount(
      serviceClient,
      body.bookingReference,
    );

    if (authoritativeAmount <= 0) {
      return Response.json(
        { error: "This booking has no payable balance." },
        { status: 409 },
      );
    }

    if (Math.abs(authoritativeAmount - body.amount) > 0.01) {
      console.warn("[Zingara PayFast] Ignoring client checkout amount mismatch", {
        bookingReference: body.bookingReference,
        requestedAmount: body.amount,
      });
    }

    const config = getPayFastConfig();
    if (!config.configured) {
      recordPlatformFailureEventBestEffort(
        {
          bookingReference: body.bookingReference,
          journeyId: body.journeyId ?? null,
          metadata: {
            section: body.section ?? null,
            source: "online",
          },
          operation: "prepare_payfast_checkout",
          route: "/api/payfast/checkout",
          safeFingerprint: "payfast_checkout_config_missing",
          service: "PAYFAST CHECKOUT",
          statusCode: 503,
          summary: "PayFast checkout configuration is incomplete.",
          threshold: 1,
        },
        serviceClient,
      );
      return Response.json(
        { error: "PayFast checkout is not configured." },
        { status: 503 },
      );
    }

    const payFastConfig = {
      ...config,
      cancelUrl: createPayFastResultUrl(
        config.cancelUrl,
        "cancelled",
        body.bookingReference,
      ),
      notifyUrl: config.notifyUrl,
      returnUrl: createPayFastResultUrl(
        config.returnUrl,
        "return",
        body.bookingReference,
      ),
    };
    const { firstName, lastName } = splitName(body.customer?.name);
    const paymentData = createPayFastPaymentData(
      {
        amount: authoritativeAmount,
        cellNumber: normalizePhone(body.customer?.phone),
        customString1: body.bookingReference,
        customString2: body.section,
        emailAddress: body.customer?.email,
        itemDescription:
          body.itemDescription ??
          `Zingara booking ${body.bookingReference}`,
        itemName: body.itemName ?? "The Royal Countess Zingara Booking",
        merchantPaymentId: body.bookingReference,
        nameFirst: firstName,
        nameLast: lastName,
      },
      payFastConfig,
    );

    recordPlatformEventBestEffort(
      {
        bookingReference: body.bookingReference,
        durationMs: Date.now() - startedAt,
        eventType: "payment_initiated",
        journeyId: body.journeyId ?? null,
        metadata: {
          section: body.section ?? null,
          source: "online",
        },
        operation: "prepare_payfast_checkout",
        route: "/api/payfast/checkout",
        statusCode: 200,
      },
      serviceClient,
    );
    recoverPlatformIncidentBestEffort(
      {
        fingerprint: "payfast_checkout_unavailable",
        service: "PAYFAST CHECKOUT",
        summary: "PayFast checkout preparation recovered.",
      },
      serviceClient,
    );
    recoverPlatformIncidentBestEffort(
      {
        fingerprint: "payfast_checkout_config_missing",
        service: "PAYFAST CHECKOUT",
        summary: "PayFast checkout configuration recovered.",
      },
      serviceClient,
    );

    return Response.json({
      actionUrl: getPayFastPaymentFormAction(payFastConfig),
      fields: paymentData,
      mode: payFastConfig.mode,
    });
  } catch (error) {
    console.error("[Zingara PayFast] Checkout payload failed", error);

    return Response.json(
      { error: "PayFast checkout could not be prepared." },
      { status: 500 },
    );
  }
}
