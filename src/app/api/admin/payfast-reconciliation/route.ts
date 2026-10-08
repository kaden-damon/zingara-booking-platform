import { parsePayFastHistoryCsv } from "@/lib/payfast/reconciliation";
import {
  getRolePermissions,
  requireActiveStaff,
} from "@/lib/supabase/serverAdmin";
import { sendStaffPushNotification } from "@/lib/supabase/staffPush";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type BookingRow = {
  archived_at: string | null;
  booking_reference: string;
  id: string;
};

type PaymentRow = {
  amount: number;
  booking_id: string;
  id: string;
  method: string;
  payment_status: string;
  processed_at: string | null;
  provider_gross_amount: number | null;
  provider_transaction_id: string | null;
  transaction_fee_amount: number | null;
};

function canReconcile(
  profile: NonNullable<Awaited<ReturnType<typeof requireActiveStaff>>["staffProfile"]>,
) {
  const role = Array.isArray(profile.roles) ? profile.roles[0] : profile.roles;
  return getRolePermissions(role).includes("bookings:reconcile");
}

function chunks<T>(values: T[], size = 100) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

export async function POST(request: Request) {
  const auth = await requireActiveStaff(request);
  if (auth.error || !auth.serviceClient || !auth.staffProfile) return auth.error;
  if (!canReconcile(auth.staffProfile)) {
    return Response.json({ error: "Payment reconciliation access is required." }, { status: 403 });
  }

  try {
    const form = await request.formData();
    const upload = form.get("file");
    if (!(upload instanceof File) || upload.size <= 0 || upload.size > 5_000_000) {
      return Response.json({ error: "Choose a PayFast CSV file smaller than 5 MB." }, { status: 400 });
    }

    const csv = await upload.text();
    const parsed = parsePayFastHistoryCsv(csv);
    const references = Array.from(new Set(parsed.transactions.map((row) => row.bookingReference)));
    const bookings: BookingRow[] = [];

    for (const batch of chunks(references)) {
      const { data, error } = await auth.serviceClient
        .from("bookings")
        .select("id,booking_reference,archived_at")
        .in("booking_reference", batch);
      if (error) throw error;
      bookings.push(...((data ?? []) as BookingRow[]));
    }

    const bookingByReference = new Map(bookings.map((booking) => [booking.booking_reference, booking]));
    const payments: PaymentRow[] = [];
    for (const batch of chunks(bookings.map((booking) => booking.id))) {
      const { data, error } = await auth.serviceClient
        .from("payments")
        .select("id,booking_id,amount,method,payment_status,processed_at,provider_gross_amount,provider_transaction_id,transaction_fee_amount")
        .in("booking_id", batch);
      if (error) throw error;
      payments.push(...((data ?? []) as PaymentRow[]));
    }

    const paymentByProviderId = new Map(
      payments
        .filter((payment) => payment.provider_transaction_id)
        .map((payment) => [payment.provider_transaction_id!, payment]),
    );
    const pendingByBooking = new Map<string, PaymentRow[]>();
    for (const payment of payments) {
      if (payment.payment_status !== "pending_payment" || payment.provider_transaction_id) continue;
      pendingByBooking.set(payment.booking_id, [
        ...(pendingByBooking.get(payment.booking_id) ?? []),
        payment,
      ]);
    }

    const { data: existingImport, error: existingError } = await auth.serviceClient
      .from("payfast_reconciliation_imports")
      .select("id,row_count,imported_at")
      .eq("checksum", parsed.checksum)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existingImport) {
      return Response.json({ alreadyImported: true, import: existingImport });
    }

    const { data: imported, error: importError } = await auth.serviceClient
      .from("payfast_reconciliation_imports")
      .insert({
        checksum: parsed.checksum,
        imported_by: auth.staffProfile.id,
        original_filename: upload.name || "PayFast transaction history.csv",
        row_count: parsed.transactions.length,
      })
      .select("id,row_count,imported_at")
      .single();
    if (importError) throw importError;

    const counts = {
      amountMismatch: 0,
      correct: 0,
      latePayment: 0,
      missingLocalPayment: 0,
      providerReversal: 0,
      unresolved: 0,
    };
    const newAlerts: Array<{ bookingReference: string; message: string }> = [];

    for (const transaction of parsed.transactions) {
      const booking = bookingByReference.get(transaction.bookingReference);
      const providerPayment = paymentByProviderId.get(transaction.providerPaymentId);
      const pending = booking
        ? (pendingByBooking.get(booking.id) ?? []).find(
            (payment) => Math.abs(Number(payment.provider_gross_amount) - Math.abs(transaction.grossAmount)) <= 0.01,
          )
        : undefined;
      const matchedPayment = providerPayment ?? pending;
      const bookingAmount = Number(matchedPayment?.amount ?? 0);
      const transactionFee = Number(matchedPayment?.transaction_fee_amount ?? 0);

      const { data: event, error: eventError } = await auth.serviceClient
        .from("payfast_provider_events")
        .upsert({
          booking_amount: bookingAmount,
          event_at: transaction.eventAt,
          event_type: transaction.eventType,
          evidence: { fundingType: transaction.fundingType, source: "payfast-csv" },
          import_id: imported.id,
          merchant_net_amount: transaction.merchantNetAmount,
          merchant_payment_id: transaction.bookingReference,
          provider_gross_amount: transaction.grossAmount,
          provider_processing_fee: transaction.providerProcessingFee,
          provider_status: transaction.providerStatus,
          provider_transaction_id: transaction.providerPaymentId,
          transaction_fee_amount: transactionFee,
        }, { onConflict: "provider_transaction_id,event_type,event_at,provider_gross_amount" })
        .select("id")
        .single();
      if (eventError) throw eventError;

      let action: { action_type: string; message: string } | null = null;
      if (!booking) {
        counts.unresolved += 1;
        action = { action_type: "unresolved", message: "Payment needs review." };
      } else if (transaction.eventType === "reversal") {
        if (providerPayment && !["cancelled", "refunded"].includes(providerPayment.payment_status)) {
          counts.providerReversal += 1;
          action = { action_type: "provider_reversal", message: "Payment reversed — check booking." };
        } else if (!providerPayment) {
          counts.unresolved += 1;
          action = { action_type: "unresolved", message: "Payment needs review." };
        } else {
          counts.correct += 1;
        }
      } else if (providerPayment) {
        const grossMatches = Math.abs(Number(providerPayment.provider_gross_amount) - transaction.grossAmount) <= 0.01;
        if (!grossMatches) {
          counts.amountMismatch += 1;
          action = { action_type: "amount_mismatch", message: "Payment amount needs review." };
        } else {
          counts.correct += 1;
        }
      } else if (pending) {
        if (booking.archived_at) {
          counts.latePayment += 1;
          action = { action_type: "late_payment", message: "Payment received after the booking closed. Review the booking." };
        } else {
          counts.missingLocalPayment += 1;
          action = { action_type: "missing_local_payment", message: "Payment received but not showing on booking." };
        }
      } else {
        counts.amountMismatch += 1;
        action = { action_type: "amount_mismatch", message: "Payment amount needs review." };
      }

      if (action) {
        const { data: inserted, error: actionError } = await auth.serviceClient
          .from("payfast_reconciliation_actions")
          .upsert({
            action_type: action.action_type,
            booking_id: booking?.id ?? null,
            booking_reference: transaction.bookingReference,
            message: action.message,
            provider_event_id: event.id,
          }, { ignoreDuplicates: true, onConflict: "provider_event_id,action_type" })
          .select("id");
        if (actionError) throw actionError;
        if ((inserted ?? []).length > 0) {
          newAlerts.push({ bookingReference: transaction.bookingReference, message: action.message });
        }
      }
    }

    await Promise.all(newAlerts.slice(0, 20).map((alert) =>
      sendStaffPushNotification({
        body: alert.message,
        bookingReference: alert.bookingReference,
        title: "Payment Needs Review",
        trigger: "payment-review",
      }),
    ));

    return Response.json({
      counts,
      import: imported,
      newAlertCount: newAlerts.length,
      transactionCount: parsed.transactions.length,
    });
  } catch (error) {
    console.error("[Zingara PayFast] Reconciliation import failed", error);
    return Response.json({ error: "PayFast reconciliation couldn't be completed. Try again." }, { status: 500 });
  }
}
