import {
  type DemoBooking,
  type PaymentStatus,
} from "@/lib/zingaraDemo";
import { getSupabaseClient } from "./client";
import { fetchSupabaseApi } from "./apiClient";
import { getSupabaseBookingId } from "./bookings";

type SupabasePaymentStatus =
  | "cancelled"
  | "comp_vip"
  | "deposit_paid"
  | "fully_paid"
  | "pending_payment"
  | "refunded";

type SupabasePaymentType =
  | "adjustment"
  | "balance"
  | "comp"
  | "deposit"
  | "full_payment"
  | "refund";

type SupabasePaymentRow = {
  amount: number;
  booking_id: string;
  created_at: string;
  id: string;
  method: string | null;
  notes: string | null;
  payment_status: SupabasePaymentStatus;
  payment_type: SupabasePaymentType;
  processed_at: string | null;
  provider_transaction_id?: string | null;
  reference: string | null;
};

function toSupabasePaymentStatus(status?: PaymentStatus): SupabasePaymentStatus {
  if (status === "deposit-paid") {
    return "deposit_paid";
  }

  if (status === "fully-paid") {
    return "fully_paid";
  }

  if (status === "comp-vip") {
    return "comp_vip";
  }

  if (status === "refunded") {
    return "refunded";
  }

  return "pending_payment";
}

function getPaymentType(booking: DemoBooking): SupabasePaymentType {
  if (booking.paymentStatus === "refunded" || booking.status === "refunded") {
    return "refund";
  }

  if (booking.paymentStatus === "comp-vip") {
    return "comp";
  }

  if (booking.paymentStatus === "deposit-paid") {
    return "deposit";
  }

  if (booking.paymentStatus === "fully-paid") {
    return "full_payment";
  }

  return booking.paymentOption === "deposit" ? "deposit" : "full_payment";
}

function getPaymentAmount(
  booking: DemoBooking,
  existingPayment?: SupabasePaymentRow | null,
) {
  if (booking.paymentStatus === "refunded" || booking.status === "refunded") {
    return existingPayment?.amount ?? booking.amountPaid ?? 0;
  }

  if (booking.paymentStatus === "comp-vip") {
    return 0;
  }

  return booking.amountPaid ?? 0;
}

function toPaymentPayload(
  booking: DemoBooking,
  bookingId: string,
  existingPayment?: SupabasePaymentRow | null,
) {
  const isRefunded =
    booking.paymentStatus === "refunded" || booking.status === "refunded";
  const refundNotes = [
    existingPayment?.notes ?? "",
    booking.refundNotes
      ? `Internal refund recorded: ${booking.refundNotes}`
      : "Internal refund recorded.",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    amount: getPaymentAmount(booking, existingPayment),
    booking_id: bookingId,
    method: isRefunded ? existingPayment?.method ?? "platform" : "platform",
    notes: isRefunded ? refundNotes : booking.refundNotes || booking.paymentOption || null,
    payment_status: toSupabasePaymentStatus(booking.paymentStatus),
    payment_type: getPaymentType(booking),
    processed_at: isRefunded
      ? existingPayment?.processed_at ?? new Date().toISOString()
      : new Date().toISOString(),
    provider_transaction_id: existingPayment?.provider_transaction_id ?? null,
    reference: booking.reference,
  };
}

async function getPaymentRows() {
  try {
    const payload = await fetchSupabaseApi<{ rows: SupabasePaymentRow[] }>(
      "/api/admin/payments",
    );

    return payload.rows ?? [];
  } catch (error) {
    console.error("[Zingara Supabase] Failed to load payments", error);
    return null;
  }
}

export async function getPayments() {
  return (await getPaymentRows()) ?? [];
}

export async function getPayment(reference: string) {
  const rows = await getPaymentRows();

  return rows?.find((row) => row.reference === reference);
}

export async function createPayment(booking: DemoBooking) {
  try {
    const payload = await fetchSupabaseApi<{ row: SupabasePaymentRow | null }>(
      "/api/admin/payments",
      {
        body: { booking },
        method: "POST",
      },
    );

    return payload.row;
  } catch (error) {
    console.error("[Zingara Supabase] Failed to create payment", error);
    return undefined;
  }
}

export async function updatePayment(booking: DemoBooking) {
  try {
    const payload = await fetchSupabaseApi<{ row: SupabasePaymentRow | null }>(
      "/api/admin/payments",
      {
        body: { booking },
        method: "PATCH",
      },
    );

    return payload.row;
  } catch (error) {
    console.error("[Zingara Supabase] Failed to update payment", error);
    return undefined;
  }
}
