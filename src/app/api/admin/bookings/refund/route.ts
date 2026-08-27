import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getPayFastConfig } from "@/lib/payfast/config";
import { notifyAppleWalletBooking } from "@/lib/appleWalletSync";
import {
  queryPayFastRefundAvailability,
  submitPayFastRefund,
} from "@/lib/payfast/refunds";
import {
  isSuperAdminProfile,
  requireActiveStaff,
  type StaffProfileRow,
} from "@/lib/supabase/serverAdmin";
import {
  recordAuditEvent,
  tryRecordAuditEvent,
} from "@/lib/supabase/serverAudit";

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

async function releaseTableClaims(
  serviceClient: SupabaseClient,
  bookingId: string,
) {
  const { error } = await serviceClient
    .from("show_tables")
    .update({
      booking_id: null,
      status: "available",
      updated_at: new Date().toISOString(),
    })
    .eq("booking_id", bookingId)
    .eq("status", "booked");

  if (error) {
    throw error;
  }
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
        .in("refund_status", ["processing", "accepted"]),
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
      .in("refund_status", ["processing", "accepted"])
      .limit(1)
      .maybeSingle();

  if (existingRefundError) {
    throw existingRefundError;
  }

  if (existingRefund) {
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

  try {
    const availability = await queryPayFastRefundAvailability(
      payment.provider_transaction_id,
      config,
    );

    if (!availability.refundable || refundAmount > availability.amountAvailable) {
      await auth.serviceClient
        .from("payment_refunds")
        .update({
          provider_response: getSafeProviderResponse(availability.raw),
          refund_status: "failed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", refundId);

      return Response.json(
        {
          error:
            availability.reason ??
            "PayFast reports that this transaction is not refundable.",
        },
        { status: 409 },
      );
    }

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

    if (providerRefund.status !== "accepted") {
      await auth.serviceClient
        .from("payment_refunds")
        .update({
          provider_response: getSafeProviderResponse(providerRefund.raw),
          provider_refund_id: providerRefund.providerRefundId ?? null,
          refund_status: "failed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", refundId);

      return Response.json(
        { error: "Refund could not be processed. No changes were made to the booking." },
        { status: 502 },
      );
    }

    const now = new Date().toISOString();

    await auth.serviceClient
      .from("payment_refunds")
      .update({
        completed_at: now,
        provider_response: getSafeProviderResponse(providerRefund.raw),
        provider_refund_id: providerRefund.providerRefundId ?? null,
        refund_status: "accepted",
        updated_at: now,
      })
      .eq("id", refundId);

    try {
      const { data: updatedBooking, error: bookingUpdateError } =
        await auth.serviceClient
          .from("bookings")
          .update({
            balance_outstanding: 0,
            booking_status: "refunded",
            payment_status: "refunded",
            updated_at: now,
          })
          .eq("id", booking.id)
          .select(refundSelect)
          .maybeSingle();

      if (bookingUpdateError) {
        throw bookingUpdateError;
      }

      const { error: paymentUpdateError } = await auth.serviceClient
        .from("payments")
        .update({
          notes: [
            `PayFast refund processed: ${reason}`,
            `Original paid amount preserved: ${payment.amount.toFixed(2)}`,
          ].join("\n"),
          payment_status: "refunded",
          payment_type: "refund",
        })
        .eq("id", payment.id);

      if (paymentUpdateError) {
        throw paymentUpdateError;
      }

      await releaseTableClaims(auth.serviceClient, booking.id);

      const { error: ticketUpdateError } = await auth.serviceClient
        .from("tickets")
        .update({
          ticket_status: "refunded",
          updated_at: now,
        })
        .eq("booking_id", booking.id);

      if (ticketUpdateError) {
        throw ticketUpdateError;
      }

      await auth.serviceClient.from("booking_lifecycle_events").insert({
        booking_id: booking.id,
        from_status: booking.booking_status,
        note: reason,
        reason,
        to_status: "refunded",
      });

      await recordAuditEvent(auth.serviceClient, auth.staffProfile, auth.user, {
        action: "booking.refund",
        afterValues: {
          amount: refundAmount,
          payment_status: "refunded",
          provider_result: providerRefund.status,
        },
        beforeValues: {
          amount: payment.amount,
          payment_status: booking.payment_status,
        },
        changedFields: ["payment_status", "booking_status", "refund_amount"],
        entityId: booking.id,
        entityReference: booking.booking_reference,
        entityType: "booking",
        outcome: "success",
        reason,
        request,
        sourceArea: "Bookings",
      });

      await notifyAppleWalletBooking(auth.serviceClient, booking.id);

      return Response.json({
        booking: updatedBooking,
        message: "Refund processed successfully.",
        refund: {
          amount: refundAmount,
          providerRefundId: providerRefund.providerRefundId ?? null,
          status: providerRefund.status,
        },
      });
    } catch (stateError) {
      await tryRecordAuditEvent(
        auth.serviceClient,
        auth.staffProfile,
        auth.user,
        {
          action: "booking.refund",
          entityId: booking.id,
          entityReference: booking.booking_reference,
          entityType: "booking",
          outcome: "failed",
          reason:
            stateError instanceof Error
              ? `PayFast accepted refund, but Zingara state update failed: ${stateError.message}`
              : "PayFast accepted refund, but Zingara state update failed.",
          request,
          sourceArea: "Bookings",
        },
      );

      return Response.json(
        {
          error:
            "PayFast accepted the refund, but Zingara could not complete local reconciliation. Escalate before retrying.",
        },
        { status: 500 },
      );
    }
  } catch (error) {
    await auth.serviceClient
      .from("payment_refunds")
      .update({
        provider_response: {
          message:
            error instanceof Error
              ? error.message
              : "PayFast refund request failed.",
        },
        refund_status: "failed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", refundId);

    await tryRecordAuditEvent(auth.serviceClient, auth.staffProfile, auth.user, {
      action: "booking.refund",
      entityId: booking.id,
      entityReference: booking.booking_reference,
      entityType: "booking",
      outcome: "failed",
      reason:
        error instanceof Error
          ? error.message
          : "PayFast refund request failed.",
      request,
      sourceArea: "Bookings",
    });

    return Response.json(
      { error: "Refund could not be processed. No changes were made to the booking." },
      { status: 502 },
    );
  }
}
