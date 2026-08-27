import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getPayFastConfig } from "@/lib/payfast/config";
import { notifyAppleWalletBooking } from "@/lib/appleWalletSync";
import {
  PayFastRefundRequestError,
  queryPayFastRefundAvailability,
  submitPayFastRefund,
} from "@/lib/payfast/refunds";
import {
  isSuperAdminProfile,
  requireActiveStaff,
  type StaffProfileRow,
} from "@/lib/supabase/serverAdmin";
import { tryRecordAuditEvent } from "@/lib/supabase/serverAudit";

export const dynamic = "force-dynamic";

type RefundRequestBody = {
  bookingReference?: string;
  password?: string;
  reason?: string;
};

type BookingRefundRow = {
  amount_paid: number;
  balance_outstanding: number;
  booking_reference: string;
  booking_status: string;
  id: string;
  payment_status: string;
  total_amount: number;
};

type PaymentRefundRow = {
  amount: number;
  booking_id: string;
  id: string;
  method: string | null;
  payment_status: string;
  payment_type: string;
  provider_transaction_id: string | null;
  reference: string | null;
};

const refundSelect =
  "id,booking_reference,booking_status,payment_status,total_amount,amount_paid,balance_outstanding";

function getSupabaseAuthClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    return null;
  }

  return createClient(supabaseUrl, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function getRefundsEnabled() {
  return process.env.PAYFAST_REFUNDS_ENABLED?.trim().toLowerCase() === "true";
}

function getSafeProviderResponse(payload: Record<string, unknown>) {
  const safeKeys = [
    "amount",
    "amount_available",
    "amount_available_for_refund",
    "available_refund_amount",
    "message",
    "reason",
    "refund_id",
    "refund_status",
    "status",
  ];
  const safePayload: Record<string, unknown> = {};

  for (const key of safeKeys) {
    if (payload[key] !== undefined) {
      safePayload[key] = payload[key];
    }
  }

  return safePayload;
}

function getRefundReason(reason?: string) {
  const value = reason?.trim() ?? "";

  if (value.length < 3 || value.length > 255) {
    return null;
  }

  return value;
}

function getStaffRole(profile: StaffProfileRow | null) {
  const role = Array.isArray(profile?.roles)
    ? profile?.roles[0]
    : profile?.roles;

  return role?.name ?? "Unknown";
}

async function verifySuperAdminPassword(email: string, password: string) {
  const authClient = getSupabaseAuthClient();

  if (!authClient) {
    return false;
  }

  const { error } = await authClient.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return false;
  }

  await authClient.auth.signOut({ scope: "local" });
  return true;
}

async function loadBookingAndPayment(
  serviceClient: SupabaseClient,
  bookingReference: string,
) {
  const { data: booking, error: bookingError } = await serviceClient
    .from("bookings")
    .select(refundSelect)
    .eq("booking_reference", bookingReference)
    .maybeSingle();

  if (bookingError) {
    throw bookingError;
  }

  if (!booking) {
    return { booking: null, payment: null };
  }

  const { data: paymentRows, error: paymentError } = await serviceClient
    .from("payments")
    .select(
      "id,booking_id,payment_type,payment_status,amount,method,reference,provider_transaction_id",
    )
    .eq("booking_id", (booking as BookingRefundRow).id)
    .eq("method", "payfast")
    .not("provider_transaction_id", "is", null)
    .gt("amount", 0)
    .order("processed_at", { ascending: false, nullsFirst: false });

  if (paymentError) {
    throw paymentError;
  }

  return {
    booking: booking as BookingRefundRow,
    payment: (paymentRows?.[0] as PaymentRefundRow | undefined) ?? null,
    providerPaymentCount: paymentRows?.length ?? 0,
    providerPaymentTotal: (paymentRows ?? []).reduce(
      (total, payment) => total + Number(payment.amount ?? 0),
      0,
    ),
  };
}

function getRequestMetadata(request: Request) {
  return {
    ipAddress:
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      null,
    requestId:
      request.headers.get("x-vercel-id") ??
      request.headers.get("x-request-id") ??
      crypto.randomUUID(),
    userAgent: request.headers.get("user-agent"),
  };
}

function getUnsupportedRefundMethodReason(
  method: "bank_payout" | "not_available" | "payment_source" | "unknown",
) {
  if (method === "bank_payout") {
    return "PayFast requires a manual bank-payout refund for this transaction.";
  }

  if (method === "not_available") {
    return "PayFast does not offer an automatic full refund method for this transaction.";
  }

  return "PayFast did not return a supported automatic full refund method.";
}

async function updateRefundAttempt(
  serviceClient: SupabaseClient,
  refundId: string,
  values: Record<string, unknown>,
) {
  const { error } = await serviceClient
    .from("payment_refunds")
    .update({
      ...values,
      updated_at: new Date().toISOString(),
    })
    .eq("id", refundId);

  if (error) {
    throw error;
  }
}

async function reconcileAcceptedRefund(
  serviceClient: SupabaseClient,
  input: {
    bookingId: string;
    providerRefundId?: string | null;
    providerResponse: Record<string, unknown>;
    reason: string;
    refundId: string;
    request: Request;
    staffProfile: StaffProfileRow;
    user: { id: string };
  },
) {
  const metadata = getRequestMetadata(input.request);
  const { data, error } = await serviceClient.rpc(
    "reconcile_payfast_refund_atomic",
    {
      p_actor_auth_user_id: input.user.id,
      p_actor_location_scope: input.staffProfile.venue_scope ?? [],
      p_actor_name: input.staffProfile.full_name,
      p_actor_role: getStaffRole(input.staffProfile),
      p_actor_staff_profile_id: input.staffProfile.id,
      p_ip_address: metadata.ipAddress,
      p_provider_refund_id: input.providerRefundId ?? null,
      p_provider_response: getSafeProviderResponse(input.providerResponse),
      p_reason: input.reason,
      p_refund_id: input.refundId,
      p_request_id: metadata.requestId,
      p_user_agent: metadata.userAgent,
    },
  );

  if (error) {
    throw error;
  }

  await notifyAppleWalletBooking(serviceClient, input.bookingId);
  return data as {
    booking_id: string;
    booking_reference: string;
    status: "already_reconciled" | "reconciled";
  };
}

export async function GET(request: Request) {
  const auth = await requireActiveStaff(request);

  if (auth.error || !auth.serviceClient || !auth.staffProfile) {
    return auth.error;
  }

  if (!isSuperAdminProfile(auth.staffProfile)) {
    return Response.json(
      { error: "Super Admin access is required." },
      { status: 403 },
    );
  }

  const refundsEnabled = getRefundsEnabled();
  const payFastConfigured = getPayFastConfig().configured;
  const { error: refundTableError } = await auth.serviceClient
    .from("payment_refunds")
    .select("id")
    .limit(1);
  const historyConfigured = !refundTableError;
  const ready = refundsEnabled && payFastConfigured && historyConfigured;
  const readinessReason = !refundsEnabled
    ? "PayFast refunds are not enabled for this environment."
    : !payFastConfigured
      ? "PayFast refund configuration is incomplete."
      : !historyConfigured
        ? "PayFast refund history is not configured."
        : "";

  const { data: payments, error: paymentsError } = await auth.serviceClient
    .from("payments")
    .select(
      "id,booking_id,amount,method,payment_status,provider_transaction_id",
    )
    .eq("method", "payfast")
    .not("provider_transaction_id", "is", null)
    .gt("amount", 0);

  if (paymentsError) {
    throw paymentsError;
  }

  const bookingIds = [
    ...new Set((payments ?? []).map((payment) => payment.booking_id as string)),
  ];
  let bookings: Array<{
    amount_paid: number | null;
    booking_reference: string;
    booking_status: string;
    id: string;
    payment_status: string;
  }> = [];
  let refunds: Array<{ booking_id: string; refund_status: string }> = [];

  if (bookingIds.length > 0) {
    const [bookingResult, refundResult] = await Promise.all([
      auth.serviceClient
        .from("bookings")
        .select("id,booking_reference,booking_status,payment_status,amount_paid")
        .in("id", bookingIds),
      auth.serviceClient
        .from("payment_refunds")
        .select("booking_id,refund_status")
        .in("booking_id", bookingIds)
        .in("refund_status", [
          "processing",
          "accepted",
          "reconciliation_required",
        ]),
    ]);

    if (bookingResult.error || refundResult.error) {
      throw bookingResult.error ?? refundResult.error;
    }

    bookings = bookingResult.data ?? [];
    refunds = refundResult.data ?? [];
  }

  const paymentsByBookingId = new Map<
    string,
    NonNullable<typeof payments>
  >();

  for (const payment of payments ?? []) {
    const bookingId = payment.booking_id as string;
    const bookingPayments = paymentsByBookingId.get(bookingId) ?? [];
    bookingPayments.push(payment);
    paymentsByBookingId.set(bookingId, bookingPayments);
  }
  const refundByBookingId = new Map(
    (refunds ?? []).map((refund) => [
      refund.booking_id as string,
      refund.refund_status as string,
    ]),
  );

  return Response.json({
    readiness: {
      enabled: refundsEnabled,
      historyConfigured,
      payFastConfigured,
      ready,
      reason: readinessReason || null,
    },
    rows: bookings.map((booking) => {
      const bookingPayments = paymentsByBookingId.get(booking.id as string) ?? [];
      const providerPaymentTotal = bookingPayments.reduce(
        (total, payment) => total + Number(payment.amount ?? 0),
        0,
      );
      const fullRefundSupported =
        bookingPayments.length === 1 &&
        Math.abs(providerPaymentTotal - Number(booking.amount_paid ?? 0)) <= 0.01;
      const refundStatus = refundByBookingId.get(booking.id as string);
      const alreadyRefunded =
        booking.booking_status === "refunded" ||
        booking.payment_status === "refunded";
      const complimentary = booking.payment_status === "comp_vip";
      const eligible =
        ready &&
        !alreadyRefunded &&
        !complimentary &&
        !refundStatus &&
        providerPaymentTotal > 0 &&
        fullRefundSupported;
      const reason = !ready
        ? readinessReason
        : alreadyRefunded
          ? "This booking is already marked as refunded."
          : complimentary
            ? "Complimentary bookings cannot be refunded through PayFast."
            : refundStatus === "processing"
              ? "A refund is already processing for this booking."
            : refundStatus === "accepted"
                ? "This booking is already marked as refunded."
                : refundStatus === "reconciliation_required"
                  ? "This refund has an unknown provider outcome and requires reconciliation before another attempt."
                : providerPaymentTotal <= 0
                  ? "Refund amount is not valid for this payment."
                  : !fullRefundSupported
                    ? "This booking requires a multi-transaction refund workflow, which is not supported yet."
                  : "";

      return {
        bookingReference: booking.booking_reference,
        eligible,
        reason: reason || null,
      };
    }),
  });
}

export async function POST(request: Request) {
  const auth = await requireActiveStaff(request);

  if (auth.error || !auth.serviceClient || !auth.staffProfile || !auth.user) {
    return auth.error;
  }

  const body = (await request.json().catch(() => ({}))) as RefundRequestBody;
  const bookingReference = body.bookingReference?.trim() ?? "";
  const reason = getRefundReason(body.reason);
  const password = body.password ?? "";

  if (!isSuperAdminProfile(auth.staffProfile)) {
    await tryRecordAuditEvent(auth.serviceClient, auth.staffProfile, auth.user, {
      action: "booking.refund",
      entityReference: bookingReference || "unknown-booking",
      entityType: "booking",
      outcome: "blocked",
      reason: "Super Admin access is required.",
      request,
      sourceArea: "Bookings",
    });

    return Response.json(
      { error: "Super Admin access is required." },
      { status: 403 },
    );
  }

  if (!bookingReference) {
    return Response.json(
      { error: "Booking reference is required." },
      { status: 400 },
    );
  }

  if (!reason) {
    return Response.json(
      { error: "Refund reason must be between 3 and 255 characters." },
      { status: 400 },
    );
  }

  if (!password) {
    return Response.json(
      { error: "Password confirmation failed." },
      { status: 401 },
    );
  }

  const verified = await verifySuperAdminPassword(auth.user.email ?? "", password);

  if (!verified) {
    await tryRecordAuditEvent(auth.serviceClient, auth.staffProfile, auth.user, {
      action: "booking.refund",
      entityReference: bookingReference,
      entityType: "booking",
      outcome: "blocked",
      reason: "Password confirmation failed.",
      request,
      sourceArea: "Bookings",
    });

    return Response.json(
      { error: "Password confirmation failed." },
      { status: 401 },
    );
  }

  if (!getRefundsEnabled()) {
    return Response.json(
      { error: "PayFast refunds are not enabled for this environment." },
      { status: 503 },
    );
  }

  const { error: refundTableError } = await auth.serviceClient
    .from("payment_refunds")
    .select("id")
    .limit(1);

  if (refundTableError) {
    return Response.json(
      { error: "PayFast refund history is not configured." },
      { status: 503 },
    );
  }

  const {
    booking,
    payment,
    providerPaymentCount,
    providerPaymentTotal,
  } = await loadBookingAndPayment(
    auth.serviceClient,
    bookingReference,
  );

  if (!booking) {
    return Response.json(
      { error: "Booking could not be resolved." },
      { status: 404 },
    );
  }

  if (
    booking.booking_status === "refunded" ||
    booking.payment_status === "refunded"
  ) {
    return Response.json(
      { error: "This booking is already marked as refunded." },
      { status: 409 },
    );
  }

  if (!payment?.provider_transaction_id) {
    return Response.json(
      { error: "This booking does not have a refundable PayFast transaction." },
      { status: 409 },
    );
  }

  if (
    providerPaymentCount !== 1 ||
    Math.abs(providerPaymentTotal - Number(booking.amount_paid ?? 0)) > 0.01
  ) {
    return Response.json(
      {
        error:
          "This booking requires a multi-transaction refund workflow, which is not supported yet.",
      },
      { status: 409 },
    );
  }

  const refundAmount = payment.amount;

  if (refundAmount <= 0) {
    return Response.json(
      { error: "Refund amount is not valid for this payment." },
      { status: 400 },
    );
  }

  const config = getPayFastConfig();

  if (!config.configured) {
    return Response.json(
      { error: "PayFast refund configuration is incomplete." },
      { status: 503 },
    );
  }

  const { data: existingRefund, error: existingRefundError } =
    await auth.serviceClient
      .from("payment_refunds")
      .select("id,refund_status")
      .eq("booking_id", booking.id)
      .in("refund_status", [
        "processing",
        "accepted",
        "reconciliation_required",
      ])
      .limit(1)
      .maybeSingle();

  if (existingRefundError) {
    throw existingRefundError;
  }

  if (existingRefund) {
    if (existingRefund.refund_status === "reconciliation_required") {
      try {
        const providerTruth = await queryPayFastRefundAvailability(
          payment.provider_transaction_id,
          config,
        );

        if (providerTruth.providerState === "refunded") {
          await reconcileAcceptedRefund(auth.serviceClient, {
            bookingId: booking.id,
            providerResponse: providerTruth.raw,
            reason,
            refundId: existingRefund.id,
            request,
            staffProfile: auth.staffProfile,
            user: auth.user,
          });

          return Response.json({
            message: "Refund reconciled successfully.",
            refund: { amount: refundAmount, status: "accepted" },
          });
        }
      } catch {
        // Keep the ambiguous attempt locked until provider truth is conclusive.
      }

      return Response.json(
        {
          error:
            "This refund has an unknown provider outcome and requires reconciliation before another attempt.",
        },
        { status: 409 },
      );
    }

    return Response.json(
      {
        error:
          existingRefund.refund_status === "accepted"
            ? "This booking is already marked as refunded."
            : "A refund is already processing for this booking.",
      },
      { status: 409 },
    );
  }

  const { data: refundRow, error: refundInsertError } = await auth.serviceClient
    .from("payment_refunds")
    .insert({
      booking_id: booking.id,
      booking_reference: booking.booking_reference,
      payment_id: payment.id,
      provider_payment_id: payment.provider_transaction_id,
      refund_amount: refundAmount,
      refund_reason: reason,
      refund_status: "processing",
      refund_type: "full",
      requested_auth_user_id: auth.user.id,
      requested_by: auth.staffProfile.id,
    })
    .select("id")
    .maybeSingle();

  if (refundInsertError) {
    return Response.json(
      { error: "A refund is already processing for this booking." },
      { status: 409 },
    );
  }

  const refundId = (refundRow as { id: string } | null)?.id;

  if (!refundId) {
    return Response.json(
      { error: "Refund attempt could not be recorded." },
      { status: 500 },
    );
  }

  let availability: Awaited<ReturnType<typeof queryPayFastRefundAvailability>>;

  try {
    availability = await queryPayFastRefundAvailability(
      payment.provider_transaction_id,
      config,
    );
  } catch (error) {
    await updateRefundAttempt(auth.serviceClient, refundId, {
      provider_response: {
        message:
          error instanceof Error
            ? error.message
            : "PayFast refund availability could not be confirmed.",
      },
      refund_status: "failed",
    });

    return Response.json(
      { error: "PayFast refund availability could not be confirmed." },
      { status: 502 },
    );
  }

  if (!availability.refundable || refundAmount > availability.amountAvailable) {
    await updateRefundAttempt(auth.serviceClient, refundId, {
      provider_response: getSafeProviderResponse(availability.raw),
      refund_status: "failed",
    });

    return Response.json(
      {
        error:
          availability.reason ??
          "PayFast reports that this transaction is not refundable.",
      },
      { status: 409 },
    );
  }

  if (availability.fullRefundMethod !== "payment_source") {
    const unsupportedReason = getUnsupportedRefundMethodReason(
      availability.fullRefundMethod,
    );

    await updateRefundAttempt(auth.serviceClient, refundId, {
      provider_response: getSafeProviderResponse(availability.raw),
      refund_status: "failed",
    });

    return Response.json({ error: unsupportedReason }, { status: 409 });
  }

  try {
    const providerRefund = await submitPayFastRefund(
      {
        amount: refundAmount,
        notifyBuyer: true,
        notifyMerchant: false,
        pfPaymentId: payment.provider_transaction_id,
        reason,
      },
      config,
    );

    if (providerRefund.status === "rejected") {
      await updateRefundAttempt(auth.serviceClient, refundId, {
        provider_response: getSafeProviderResponse(providerRefund.raw),
        provider_refund_id: providerRefund.providerRefundId ?? null,
        refund_status: "failed",
      });

      return Response.json(
        { error: "Refund could not be processed. No changes were made to the booking." },
        { status: 502 },
      );
    }

    if (providerRefund.status === "unknown") {
      await updateRefundAttempt(auth.serviceClient, refundId, {
        provider_response: getSafeProviderResponse(providerRefund.raw),
        provider_refund_id: providerRefund.providerRefundId ?? null,
        refund_status: "reconciliation_required",
      });

      return Response.json(
        {
          error:
            "PayFast returned an unknown refund outcome. The booking is unchanged and another attempt is locked pending reconciliation.",
        },
        { status: 502 },
      );
    }

    await reconcileAcceptedRefund(auth.serviceClient, {
      bookingId: booking.id,
      providerRefundId: providerRefund.providerRefundId,
      providerResponse: providerRefund.raw,
      reason,
      refundId,
      request,
      staffProfile: auth.staffProfile,
      user: auth.user,
    });

    return Response.json({
      message: "Refund processed successfully.",
      refund: {
        amount: refundAmount,
        providerRefundId: providerRefund.providerRefundId ?? null,
        status: providerRefund.status,
      },
    });
  } catch (error) {
    const definiteRejection =
      error instanceof PayFastRefundRequestError && error.definiteRejection;

    await updateRefundAttempt(auth.serviceClient, refundId, {
      provider_response: {
        message:
          error instanceof Error
            ? error.message
            : "PayFast refund request failed.",
      },
      refund_status: definiteRejection
        ? "failed"
        : "reconciliation_required",
    });

    if (definiteRejection) {
      await tryRecordAuditEvent(auth.serviceClient, auth.staffProfile, auth.user, {
        action: "booking.refund",
        entityId: booking.id,
        entityReference: booking.booking_reference,
        entityType: "booking",
        outcome: "failed",
        reason: error.message,
        request,
        sourceArea: "Bookings",
      });
    }

    return Response.json(
      {
        error: definiteRejection
          ? "Refund was rejected by PayFast. No changes were made to the booking."
          : "PayFast returned an unknown refund outcome. The booking is unchanged and another attempt is locked pending reconciliation.",
      },
      { status: 502 },
    );
  }
}
