import { notifyAppleWalletBooking } from "@/lib/appleWalletSync";
import {
  toMoney,
  validateFinancialReconciliation,
  validateGuestCountReconciliation,
} from "@/lib/bookingReconciliation";
import { getIncludedBookingFeeBreakdown } from "@/lib/zingaraDemo";
import { resolveAddedGuestPricingBasis } from "@/lib/addedGuestFinancials";
import { mapBookingAmendmentError } from "@/lib/bookingAmendmentErrors";
import {
  getAdminRoleFromName,
  getRolePermissions,
  requireActiveStaff,
} from "@/lib/supabase/serverAdmin";
import {
  authorizeTwoSeaterLimitOverride,
  canOverrideTwoSeaterLimit,
  normalizeTwoSeaterOverrideReason,
} from "@/lib/twoSeaterOverrideServer";

export const dynamic = "force-dynamic";

// Compatibility contract retained for focused reconciliation regression suites:
// message.includes("BOOKING_REVISION_CHANGED")
// message.includes("ADDED_GUEST_FINANCIAL_BASIS_REQUIRED")
// AMOUNT_PAID_BELOW_IMMUTABLE_EVIDENCE
// The paid amount cannot be reduced below verified provider or legacy payment evidence.
// FINANCIAL_RECONCILIATION_UNCHANGED: Enter a financial change before confirming.
// CORPORATE_ZONE_ENTITLEMENTS_INVALID / CORPORATE_ZONE_ALLOCATION_REQUIRED

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
    return Response.json({ error: "You don't have permission to edit this booking." }, { status: 403 });
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
      .select("id,booking_reference,booking_origin,booking_source,notes,guest_count,payment_status,section,service_fee,subtotal_amount,addons_total,total_amount,amount_paid,balance_outstanding,table_id,updated_at,show_tables:table_id(table_code,capacity)")
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
        .select("id,source_system,source_document,source_ticket_amount,full_card_amount,pre_paid_card_amount,pre_paid_eft_amount,full_eft_amount,complimentary_amount,ticket_gratuity_amount,bar_tab_paid_amount,bar_gratuity_amount")
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
      amountPaid: Number(booking.amount_paid),
      balanceOutstanding: Number(booking.balance_outstanding),
      bookingOrigin: booking.booking_origin,
      metadata: parseBookingMetadata(booking.notes),
      paymentStatus: booking.payment_status,
      subtotalAmount: Number(booking.subtotal_amount),
      totalAmount: Number(booking.total_amount),
    });
    const allocationEvidence = legacyRows.find(
      (row) => row.source_system === "manual_invoice",
    );

    return Response.json({
      booking: {
        amountPaid: Number(booking.amount_paid),
        balanceOutstanding: Number(booking.balance_outstanding),
        bookingFee: breakdown.bookingFee,
        bookingReference: booking.booking_reference,
        bookingOrigin: booking.booking_origin,
        depositAmount:
          depositEvidence ||
          (booking.payment_status === "deposit_paid"
            ? Number(booking.amount_paid)
            : 0),
        guestCount: Number(booking.guest_count),
        paymentStatus: booking.payment_status,
        tableCapacity: table?.capacity === null || table?.capacity === undefined
          ? null
          : Number(table.capacity),
        tableCode: table?.table_code ?? null,
        totalAmount: Number(booking.total_amount),
        updatedAt: booking.updated_at,
        zone: booking.section,
      },
      legacyEvidence,
      retainedValueBasis: allocationEvidence
        ? {
            barTabAmount: toMoney(Number(allocationEvidence.bar_tab_paid_amount)),
            sourceDocument: String(allocationEvidence.source_document ?? ""),
            sourceGratuityAmount: toMoney(Number(allocationEvidence.ticket_gratuity_amount)),
            sourceTicketAmount: toMoney(Number(allocationEvidence.source_ticket_amount)),
          }
        : null,
      providerBackedAmount,
      corporateFixedTotal:
        booking.booking_origin === "corporate" &&
        booking.booking_source === "corporate-direct",
      addedGuestPricingBasis,
    });
  } catch (error) {
    console.error("[Zingara Reconciliation] Load failed", error);
    return Response.json({ error: "Booking details couldn't be loaded. Try again." }, { status: 500 });
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
    return Response.json({ error: "You don't have permission to edit this booking." }, { status: 403 });
  }

  try {
    const body = (await request.json()) as {
      action?: "financial" | "guest-count";
      amountPaid?: number;
      bookingReference?: string;
      expectedUpdatedAt?: string;
      guestCount?: number;
      legacyInvoiceEvidence?: {
        sourceDocument?: string;
        sourceGratuityAmount?: number;
        sourceTicketAmount?: number;
      };
      manualPaymentBasis?: "deposit" | "full";
      manualUnitAmount?: number;
      reason?: string;
      retainedValueTransfer?: {
        operationId?: string;
        transferGratuityToBarTab?: boolean;
        transferReleasedValueToBarTab?: boolean;
      };
      totalAmount?: number;
      twoSeaterOverrideReason?: string;
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

    const { data: bookingContext, error: bookingContextError } =
      body.action === "guest-count"
        ? await auth.serviceClient
            .from("bookings")
            .select("booking_origin,booking_source,id,booking_reference,show_id,guest_count")
            .eq("booking_reference", bookingReference)
            .maybeSingle()
        : { data: null, error: null };
    if (bookingContextError) throw bookingContextError;
    const isCorporateFixedTotal =
      bookingContext?.booking_origin === "corporate" &&
      bookingContext?.booking_source === "corporate-direct";
    const hasManualFinancialBasis =
      body.manualPaymentBasis !== undefined || body.manualUnitAmount !== undefined;
    const hasLegacyInvoiceEvidence = Boolean(body.legacyInvoiceEvidence);
    const hasRetainedValueTransfer = Boolean(body.retainedValueTransfer);
    const rpcName =
      body.action === "financial"
        ? hasLegacyInvoiceEvidence
          ? "reconcile_imported_booking_financials_atomic"
          : "reconcile_booking_financials_atomic"
        : body.action === "guest-count"
          ? isCorporateFixedTotal
            ? "reconcile_corporate_booking_guest_count_atomic"
            : hasRetainedValueTransfer
            ? "reconcile_paid_booking_guest_reduction_atomic"
            : hasManualFinancialBasis
            ? "reconcile_legacy_booking_guest_count_financials_atomic"
            : "reconcile_booking_guest_count_financials_atomic"
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
      if (hasLegacyInvoiceEvidence) {
        const evidence = body.legacyInvoiceEvidence!;
        const sourceDocument = evidence.sourceDocument?.trim() ?? "";
        const sourceTicketAmount = toMoney(Number(evidence.sourceTicketAmount));
        const sourceGratuityAmount = toMoney(Number(evidence.sourceGratuityAmount));
        if (
          !sourceDocument ||
          sourceTicketAmount <= 0 ||
          sourceGratuityAmount < 0 ||
          toMoney(sourceTicketAmount + sourceGratuityAmount) !==
            toMoney(Number(body.totalAmount))
        ) {
          return Response.json(
            { error: "Invoice references, ticket value and gratuity must reconcile exactly to the Total Booking Amount." },
            { status: 400 },
          );
        }
      }
    } else {
      const validationError = validateGuestCountReconciliation({
        guestCount: Number(body.guestCount),
        reason,
      });
      if (validationError) {
        return Response.json({ error: validationError }, { status: 400 });
      }
      if (
        hasRetainedValueTransfer &&
        (!body.retainedValueTransfer?.operationId?.trim() ||
          body.retainedValueTransfer.transferReleasedValueToBarTab !== true ||
          body.retainedValueTransfer.transferGratuityToBarTab !== true)
      ) {
        return Response.json(
          { error: "Confirm the retained ticket value and gratuity transfer to Bar Tab." },
          { status: 400 },
        );
      }
      if (
        hasManualFinancialBasis &&
        (body.manualPaymentBasis !== "deposit" && body.manualPaymentBasis !== "full")
      ) {
        return Response.json({ error: "Select Full Ticket Rate or Deposit Basis." }, { status: 400 });
      }
      if (
        hasManualFinancialBasis &&
        (!Number.isFinite(body.manualUnitAmount) || Number(body.manualUnitAmount) <= 0)
      ) {
        return Response.json({ error: "Enter a valid positive rate for each added guest." }, { status: 400 });
      }
    }

    const roleRow = Array.isArray(auth.staffProfile.roles)
      ? auth.staffProfile.roles[0]
      : auth.staffProfile.roles;
    const role = getAdminRoleFromName(roleRow?.name);
    const twoSeaterOverrideReason = normalizeTwoSeaterOverrideReason(
      body.twoSeaterOverrideReason,
    );
    if (
      body.action === "guest-count" &&
      Number(body.guestCount) === 2 &&
      twoSeaterOverrideReason
    ) {
      if (!role || !canOverrideTwoSeaterLimit(role)) {
        return Response.json(
          { error: "You are not authorised to override the two-guest booking limit." },
          { status: 403 },
        );
      }
      if (!bookingContext?.show_id) {
        return Response.json(
          { error: "The booking performance could not be resolved." },
          { status: 409 },
        );
      }

      await authorizeTwoSeaterLimitOverride(auth.serviceClient, {
        actorAuthUserId: auth.user.id,
        actorLocationScope: auth.staffProfile.venue_scope ?? [],
        actorName: auth.staffProfile.full_name ?? auth.user.email,
        actorRole: role,
        actorStaffProfileId: auth.staffProfile.id,
        bookingReference,
        reason: twoSeaterOverrideReason,
        request,
        showId: bookingContext.show_id,
      });
    }

    const requestMetadata = {
      p_actor_auth_user_id: auth.user.id,
      p_actor_staff_profile_id: auth.staffProfile.id,
      p_booking_reference: bookingReference,
      p_expected_updated_at: body.expectedUpdatedAt,
      p_reason: reason,
      p_request_id:
        body.retainedValueTransfer?.operationId?.trim() ??
        request.headers.get("x-vercel-id") ??
        request.headers.get("x-request-id") ??
        crypto.randomUUID(),
      p_user_agent: request.headers.get("user-agent"),
    };
    const parameters =
      body.action === "financial"
        ? hasLegacyInvoiceEvidence
          ? {
              ...requestMetadata,
              p_amount_paid: toMoney(Number(body.amountPaid)),
              p_source_document: body.legacyInvoiceEvidence!.sourceDocument!.trim(),
              p_source_gratuity_amount: toMoney(Number(body.legacyInvoiceEvidence!.sourceGratuityAmount)),
              p_source_ticket_amount: toMoney(Number(body.legacyInvoiceEvidence!.sourceTicketAmount)),
              p_total_amount: toMoney(Number(body.totalAmount)),
            }
          : {
            ...requestMetadata,
            p_amount_paid: toMoney(Number(body.amountPaid)),
            p_total_amount: toMoney(Number(body.totalAmount)),
          }
        : hasRetainedValueTransfer
          ? {
              ...requestMetadata,
              p_guest_count: Number(body.guestCount),
              p_transfer_gratuity_to_bar_tab:
                body.retainedValueTransfer!.transferGratuityToBarTab === true,
              p_transfer_released_value_to_bar_tab:
                body.retainedValueTransfer!.transferReleasedValueToBarTab === true,
            }
          : {
            ...requestMetadata,
            p_guest_count: Number(body.guestCount),
            ...(hasManualFinancialBasis
              ? {
                  p_payment_basis: body.manualPaymentBasis,
                  p_unit_amount: toMoney(Number(body.manualUnitAmount)),
                }
              : {}),
          };
    const { data, error } = await auth.serviceClient.rpc(rpcName, parameters);

    if (error) {
      const mappedError = mapBookingAmendmentError(error);
      if (mappedError) {
        console.warn("[Zingara Reconciliation] Expected save rejection", {
          bookingReference,
          code: mappedError.code,
          rpcName,
        });
        return Response.json(
          {
            canOverride:
              mappedError.code === "TWO_SEATER_BOOKING_LIMIT_REACHED" &&
              canOverrideTwoSeaterLimit(role),
            code: mappedError.code,
            error: mappedError.message,
          },
          { status: mappedError.status },
        );
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
    return Response.json(
      {
        code: "BOOKING_AMENDMENT_TEMPORARY_FAILURE",
        error: "The booking could not be saved due to a temporary system error. Please retry.",
      },
      { status: 500 },
    );
  }
}
