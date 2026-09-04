import { notifyAppleWalletBooking } from "@/lib/appleWalletSync";
import {
  toMoney,
  validateFinancialReconciliation,
  validateGuestCountReconciliation,
} from "@/lib/bookingReconciliation";
import { getIncludedBookingFeeBreakdown } from "@/lib/zingaraDemo";
import { resolveAddedGuestPricingBasis } from "@/lib/addedGuestFinancials";
import {
  getRolePermissions,
  requireActiveStaff,
} from "@/lib/supabase/serverAdmin";

export const dynamic = "force-dynamic";

function canReconcile(
  profile: NonNullable<Awaited<ReturnType<typeof requireActiveStaff>>["staffProfile"]>,
) {
  const role = Array.isArray(profile.roles) ? profile.roles[0] : profile.roles;
  return getRolePermissions(role).includes("bookings:reconcile");
}

async function checkBookingLock(
  serviceClient: NonNullable<Awaited<ReturnType<typeof requireActiveStaff>>["serviceClient"]>,
  bookingReference: string,
  staffProfileId: string,
) {
  const staleBefore = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data, error } = await serviceClient
    .from("booking_edit_locks")
    .select("staff_profile_id")
    .eq("booking_reference", bookingReference)
    .is("released_at", null)
    .gte("last_activity_at", staleBefore)
    .maybeSingle();

  if (error) throw error;
  return Boolean(data && data.staff_profile_id !== staffProfileId);
}

function mapLegacyEvidence(rows: Record<string, unknown>[]) {
  const fields = [
    ["Full card", "full_card_amount"],
    ["Prepaid card", "pre_paid_card_amount"],
    ["Prepaid EFT", "pre_paid_eft_amount"],
    ["Full EFT", "full_eft_amount"],
    ["Complimentary", "complimentary_amount"],
    ["Ticket gratuity", "ticket_gratuity_amount"],
    ["Bar tab", "bar_tab_paid_amount"],
    ["Bar gratuity", "bar_gratuity_amount"],
  ] as const;

  return fields
    .map(([label, field]) => ({
      amount: toMoney(
        rows.reduce((sum, row) => sum + Number(row[field] ?? 0), 0),
      ),
      label,
    }))
    .filter((item) => item.amount > 0);
}

function parseBookingMetadata(notes: string | null) {
  const prefix = "__zingara_booking_meta__:";
  if (!notes?.startsWith(prefix)) return null;
  try {
    return JSON.parse(notes.slice(prefix.length)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const auth = await requireActiveStaff(request);

  if (auth.error || !auth.serviceClient || !auth.staffProfile) {
    return auth.error;
  }

  if (!canReconcile(auth.staffProfile)) {
    return Response.json({ error: "Booking reconciliation access is required." }, { status: 403 });
  }

  const bookingReference = new URL(request.url).searchParams
    .get("bookingReference")
    ?.trim()
    .toUpperCase();

  if (!bookingReference) {
    return Response.json({ error: "Booking reference is required." }, { status: 400 });
  }

  try {
    const { data: booking, error } = await auth.serviceClient
      .from("bookings")
      .select("id,booking_reference,booking_origin,notes,guest_count,payment_status,section,service_fee,subtotal_amount,addons_total,total_amount,amount_paid,balance_outstanding,table_id,updated_at,show_tables:table_id(table_code)")
      .eq("booking_reference", bookingReference)
      .maybeSingle();

    if (error) throw error;
    if (!booking) {
      return Response.json({ error: "Booking could not be found." }, { status: 404 });
    }

    const [paymentsResult, evidenceResult] = await Promise.all([
      auth.serviceClient
        .from("payments")
        .select("amount,provider_transaction_id,provider_gross_amount,payment_status")
        .eq("booking_id", booking.id),
      auth.serviceClient
        .from("legacy_booking_payment_evidence")
        .select("full_card_amount,pre_paid_card_amount,pre_paid_eft_amount,full_eft_amount,complimentary_amount,ticket_gratuity_amount,bar_tab_paid_amount,bar_gratuity_amount")
        .eq("booking_id", booking.id),
    ]);

    if (paymentsResult.error) throw paymentsResult.error;
    if (evidenceResult.error) throw evidenceResult.error;

    const payments = paymentsResult.data ?? [];
    const legacyRows = (evidenceResult.data ?? []) as Record<string, unknown>[];
    const providerBackedAmount = toMoney(
      payments
        .filter(
          (payment) =>
            payment.provider_transaction_id || payment.provider_gross_amount,
        )
        .filter((payment) =>
          ["deposit_paid", "fully_paid"].includes(payment.payment_status),
        )
        .reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0),
    );
    const legacyEvidence = mapLegacyEvidence(legacyRows);
    const depositEvidence = legacyEvidence
      .filter((item) => item.label.startsWith("Prepaid"))
      .reduce((sum, item) => sum + item.amount, 0);
    const breakdown = getIncludedBookingFeeBreakdown(
      Math.max(Number(booking.subtotal_amount) - Number(booking.addons_total), 0),
    );
    const table = Array.isArray(booking.show_tables)
      ? booking.show_tables[0]
      : booking.show_tables;
    const addedGuestPricingBasis = resolveAddedGuestPricingBasis({
      bookingOrigin: booking.booking_origin,
      metadata: parseBookingMetadata(booking.notes),
    });

    return Response.json({
      booking: {
        amountPaid: Number(booking.amount_paid),
        balanceOutstanding: Number(booking.balance_outstanding),
        bookingFee: breakdown.bookingFee,
        bookingReference: booking.booking_reference,
        depositAmount:
          depositEvidence ||
          (booking.payment_status === "deposit_paid"
            ? Number(booking.amount_paid)
            : 0),
        guestCount: Number(booking.guest_count),
        paymentStatus: booking.payment_status,
        tableCode: table?.table_code ?? null,
        totalAmount: Number(booking.total_amount),
        updatedAt: booking.updated_at,
        zone: booking.section,
      },
      legacyEvidence,
      providerBackedAmount,
      addedGuestPricingBasis,
    });
  } catch (error) {
    console.error("[Zingara Reconciliation] Load failed", error);
    return Response.json({ error: "Booking reconciliation details could not be loaded." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireActiveStaff(request);

  if (
    auth.error ||
    !auth.serviceClient ||
    !auth.staffProfile ||
    !auth.user
  ) {
    return auth.error;
  }

  if (!canReconcile(auth.staffProfile)) {
    return Response.json({ error: "Booking reconciliation access is required." }, { status: 403 });
  }

  try {
    const body = (await request.json()) as {
      action?: "financial" | "guest-count";
      amountPaid?: number;
      bookingReference?: string;
      expectedUpdatedAt?: string;
      guestCount?: number;
      reason?: string;
      totalAmount?: number;
    };
    const bookingReference = body.bookingReference?.trim().toUpperCase();
    const reason = body.reason?.trim() ?? "";

    if (!bookingReference || !body.expectedUpdatedAt) {
      return Response.json({ error: "Booking reference and current revision are required." }, { status: 400 });
    }

    if (
      await checkBookingLock(
        auth.serviceClient,
        bookingReference,
        auth.staffProfile.id,
      )
    ) {
      return Response.json({ error: "This booking is currently being edited." }, { status: 409 });
    }

    const rpcName =
      body.action === "financial"
        ? "reconcile_booking_financials_atomic"
        : body.action === "guest-count"
          ? "reconcile_booking_guest_count_financials_atomic"
          : null;

    if (!rpcName) {
      return Response.json({ error: "A supported reconciliation action is required." }, { status: 400 });
    }

    if (body.action === "financial") {
      const validationError = validateFinancialReconciliation({
        amountPaid: Number(body.amountPaid),
        reason,
        totalAmount: Number(body.totalAmount),
      });
      if (validationError) {
        return Response.json({ error: validationError }, { status: 400 });
      }
    } else {
      const validationError = validateGuestCountReconciliation({
        guestCount: Number(body.guestCount),
        reason,
      });
      if (validationError) {
        return Response.json({ error: validationError }, { status: 400 });
      }
    }

    const requestMetadata = {
      p_actor_auth_user_id: auth.user.id,
      p_actor_staff_profile_id: auth.staffProfile.id,
      p_booking_reference: bookingReference,
      p_expected_updated_at: body.expectedUpdatedAt,
      p_reason: reason,
      p_request_id:
        request.headers.get("x-vercel-id") ??
        request.headers.get("x-request-id") ??
        crypto.randomUUID(),
      p_user_agent: request.headers.get("user-agent"),
    };
    const parameters =
      body.action === "financial"
        ? {
            ...requestMetadata,
            p_amount_paid: toMoney(Number(body.amountPaid)),
            p_total_amount: toMoney(Number(body.totalAmount)),
          }
        : {
            ...requestMetadata,
            p_guest_count: Number(body.guestCount),
          };
    const { data, error } = await auth.serviceClient.rpc(rpcName, parameters);

    if (error) {
      const message = error.message ?? "";
      if (message.includes("BOOKING_REVISION_CHANGED")) {
        return Response.json({ error: "This booking changed. Reload and review the latest values." }, { status: 409 });
      }
      if (message.includes("BOOKING_NOT_FOUND")) {
        return Response.json({ error: "The booking could not be found." }, { status: 404 });
      }
      if (message.includes("GUEST_COUNT_UNCHANGED")) {
        return Response.json({ error: "Enter a different guest count before confirming." }, { status: 400 });
      }
      if (message.includes("ZONE_CAPACITY_EXCEEDED")) {
        return Response.json({ error: "The show does not have enough capacity in this seating zone." }, { status: 409 });
      }
      if (message.includes("BOOKING_TABLE_STATE_INVALID")) {
        return Response.json({ error: "The current table assignment must be repaired before changing guest count." }, { status: 409 });
      }
      if (message.includes("SHOW_NOT_FOUND")) {
        return Response.json({ error: "The booking's performance could not be found." }, { status: 409 });
      }
      if (message.includes("SHOW_NOT_ACTIVE")) {
        return Response.json({ error: "Guests can only be added while the performance is active. Guest-count decreases remain available." }, { status: 409 });
      }
      if (message.includes("ADDED_GUEST_FINANCIAL_BASIS_REQUIRED")) {
        return Response.json({ error: "The original payment basis is not authoritative for this legacy booking. Reconcile its financials separately before adding guests." }, { status: 409 });
      }
      if (message.includes("BOOKING_RECONCILIATION_NOT_ALLOWED")) {
        return Response.json({ error: "This booking is not eligible for reconciliation." }, { status: 409 });
      }
      if (message.includes("RECONCILIATION_PERMISSION_REQUIRED")) {
        return Response.json({ error: "Booking reconciliation access is required." }, { status: 403 });
      }
      throw error;
    }

    if (body.action === "guest-count") {
      const result = data as { booking_id?: string } | null;
      if (result?.booking_id) {
        await notifyAppleWalletBooking(auth.serviceClient, result.booking_id);
      }
    }

    return Response.json({ result: data });
  } catch (error) {
    console.error("[Zingara Reconciliation] Save failed", error);
    return Response.json({ error: "Booking reconciliation could not be saved." }, { status: 500 });
  }
}
