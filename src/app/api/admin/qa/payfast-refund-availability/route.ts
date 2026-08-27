import { getPayFastConfig } from "@/lib/payfast/config";
import { notifyAppleWalletBooking } from "@/lib/appleWalletSync";
import { queryPayFastRefundAvailability } from "@/lib/payfast/refunds";
import {
  isSuperAdminProfile,
  requireActiveStaff,
  type StaffProfileRow,
} from "@/lib/supabase/serverAdmin";

export const dynamic = "force-dynamic";

const qaBookingReference = "PH396M-R50QA";
const qaRefundAmount = 50;

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

  return Object.fromEntries(
    safeKeys.flatMap((key) =>
      payload[key] === undefined ? [] : [[key, payload[key]]],
    ),
  );
}

function getStaffRole(profile: StaffProfileRow) {
  const role = Array.isArray(profile.roles) ? profile.roles[0] : profile.roles;
  return role?.name ?? "Unknown";
}

export async function GET(request: Request) {
  const auth = await requireActiveStaff(request);

  if (auth.error || !auth.serviceClient || !auth.staffProfile || !auth.user) {
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
      .select("id,amount,provider_transaction_id")
      .eq("booking_id", booking.id)
      .eq("method", "payfast")
      .not("provider_transaction_id", "is", null)
      .gt("amount", 0),
    auth.serviceClient
      .from("payment_refunds")
      .select(
        "id,booking_id,booking_reference,payment_id,provider,provider_payment_id,refund_amount,refund_reason,refund_status,refund_type",
      )
      .eq("booking_id", booking.id),
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
      { error: "The fixed booking no longer has one proven R50 PayFast payment." },
      { status: 409 },
    );
  }

  const refunds = refundResult.data ?? [];
  const refund = refunds[0];

  if (
    refunds.length !== 1 ||
    !refund ||
    refund.booking_id !== booking.id ||
    refund.booking_reference !== qaBookingReference ||
    refund.payment_id !== payments[0].id ||
    refund.provider !== "payfast" ||
    refund.provider_payment_id !== payments[0].provider_transaction_id ||
    refund.refund_status !== "reconciliation_required" ||
    refund.refund_type !== "full" ||
    Math.abs(Number(refund.refund_amount) - qaRefundAmount) > 0.01
  ) {
    return Response.json(
      {
        error:
          "The fixed booking does not have exactly one matching locked R50 refund to reconcile.",
      },
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

    if (availability.providerState === "refunded") {
      const metadata = getRequestMetadata(request);
      const { data, error } = await auth.serviceClient.rpc(
        "reconcile_payfast_refund_atomic",
        {
          p_actor_auth_user_id: auth.user.id,
          p_actor_location_scope: auth.staffProfile.venue_scope ?? [],
          p_actor_name: auth.staffProfile.full_name,
          p_actor_role: getStaffRole(auth.staffProfile),
          p_actor_staff_profile_id: auth.staffProfile.id,
          p_ip_address: metadata.ipAddress,
          p_provider_refund_id: null,
          p_provider_response: getSafeProviderResponse(availability.raw),
          p_reason: refund.refund_reason,
          p_refund_id: refund.id,
          p_request_id: metadata.requestId,
          p_user_agent: metadata.userAgent,
        },
      );

      if (error) {
        return Response.json(
          {
            completed: true,
            message:
              "PayFast completion was confirmed, but atomic local reconciliation did not complete.",
            providerState: "refunded",
            querySucceeded: true,
            refundable: false,
          },
          { status: 500 },
        );
      }

      await notifyAppleWalletBooking(auth.serviceClient, booking.id);
      const result = data as { status?: string } | null;

      return Response.json({
        completed: true,
        message:
          result?.status === "already_reconciled"
            ? "The completed PayFast refund was already reconciled locally."
            : "The completed PayFast refund was reconciled locally exactly once.",
        providerState: availability.providerState,
        querySucceeded: true,
        refundable: false,
      });
    }

    return Response.json({
      completed: false,
      message:
        availability.providerState === "refundable"
          ? "PayFast still reports the transaction as refundable, so refund completion is not proven and the local refund remains locked."
          : "PayFast did not conclusively report a completed refund, so the local refund remains locked.",
      providerState: availability.providerState,
      querySucceeded: true,
      refundable: availability.refundable,
    });
  } catch {
    return Response.json(
      {
        completed: false,
        message:
          "PayFast refund status could not be confirmed; the local refund remains locked.",
        providerState: "unknown",
        querySucceeded: false,
        refundable: false,
      },
      { status: 502 },
    );
  }
}
