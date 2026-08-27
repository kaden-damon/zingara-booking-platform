import {
  createExistingBookingPayFastCheckout,
  preparePayFastCheckoutAttempt,
} from "@/lib/payfast/checkout";
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

    let attemptResult: Awaited<ReturnType<typeof preparePayFastCheckoutAttempt>>;

    try {
      attemptResult = await preparePayFastCheckoutAttempt(serviceClient, {
        amount: body.amount,
        bookingReference: body.bookingReference,
      });
    } catch (attemptError) {
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

    if ("error" in attemptResult) {
      return Response.json(
        { error: attemptResult.error },
        { status: attemptResult.status },
      );
    }

    if (
      typeof body.amount === "number" &&
      typeof attemptResult.attempt?.amount_due === "number" &&
      Math.abs(attemptResult.attempt.amount_due - body.amount) > 0.01
    ) {
      console.warn("[Zingara PayFast] Ignoring client checkout amount mismatch", {
        bookingReference: body.bookingReference,
        requestedAmount: body.amount,
      });
    }

    const checkout = await createExistingBookingPayFastCheckout(
      serviceClient,
      {
        amount: body.amount,
        preparedAmount: attemptResult.attempt.amount_due,
        bookingReference: body.bookingReference,
        customer: body.customer,
        itemDescription: body.itemDescription,
        itemName: body.itemName,
        section: body.section,
      },
    );

    if ("error" in checkout) {
      if (checkout.status === 503) {
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
      }

      return Response.json(
        { error: checkout.error },
        { status: checkout.status },
      );
    }

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
      actionUrl: checkout.actionUrl,
      fields: checkout.fields,
      mode: checkout.mode,
    });
  } catch (error) {
    console.error("[Zingara PayFast] Checkout payload failed", error);

    return Response.json(
      { error: "PayFast checkout could not be prepared." },
      { status: 500 },
    );
  }
}
