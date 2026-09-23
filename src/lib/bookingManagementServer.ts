import type { SupabaseClient } from "@supabase/supabase-js";

import { includedBookingFeeAmount } from "./bookingFees";
import {
  getBookingManagementStateFingerprint,
  isGuestManageableStandardBooking,
  resolveBookingCancellationPolicy,
  type BookingCancellationPolicy,
  type BookingManagementPayment,
  type BookingManagementRefund,
  type ManagedBookingKind,
} from "./bookingManagementPolicy";
import { normalizePhoneForComparison } from "./phone";
import type { DemoBooking, SeatingZoneId } from "./zingaraDemo";

const metadataPrefix = "__zingara_booking_meta__:";

type BookingRow = {
  amount_paid: number;
  archived_at: string | null;
  balance_outstanding: number;
  booking_origin: string | null;
  booking_reference: string;
  booking_source: string;
  booking_status: string;
  corporate_request_id: string | null;
  customer_id: string;
  guest_count: number;
  id: string;
  notes: string | null;
  payment_status: string;
  section: string | null;
  show_id: string;
  total_amount: number;
  updated_at: string;
  zone_entitlements: unknown;
};

type ShowRow = {
  date: string;
  id: string;
  name: string;
  status: string;
  time: string;
  venue: string;
};

export type BookingManagementContext = {
  booking: BookingRow;
  bookingKind: ManagedBookingKind;
  depositAmount: number | null;
  guestSelfServiceEligible: boolean;
  metadata: DemoBooking | null;
  policy: BookingCancellationPolicy;
  show: ShowRow;
  stateFingerprint: string;
  zoneId: SeatingZoneId | null;
};

function parseMetadata(notes: string | null) {
  if (!notes?.startsWith(metadataPrefix)) return null;
  try {
    return JSON.parse(notes.slice(metadataPrefix.length)) as DemoBooking;
  } catch {
    return null;
  }
}

export function normalizeBookingZone(section: string | null | undefined) {
  const value = section?.trim().toLowerCase();
  if (value === "elevated stage" || value === "elevated-stage" || value === "es") return "elevated-stage";
  if (value === "golden circle" || value === "golden-circle" || value === "gc") return "golden-circle";
  if (value === "middle ring" || value === "middle-ring" || value === "mr") return "middle-ring";
  if (["private booth", "private booths", "royal booth", "royal booths", "royal-booths", "pb"].includes(value ?? "")) return "royal-booths";
  if (value === "royal balcony" || value === "royal-balcony" || value === "rb") return "royal-balcony";
  return null;
}

function getDepositAmount(metadata: DemoBooking | null, booking: BookingRow) {
  const depositPerPerson = Number(metadata?.pricingProvenance?.depositPerPerson);
  if (Number.isFinite(depositPerPerson) && depositPerPerson >= 0) {
    return Math.round(depositPerPerson * booking.guest_count * 100) / 100;
  }

  const percentage = Number(metadata?.depositPercentage);
  if (Number.isFinite(percentage) && percentage >= 0 && percentage <= 100) {
    return Math.round(Number(booking.total_amount) * percentage) / 100;
  }

  return null;
}

function getBookingKind(booking: BookingRow): ManagedBookingKind {
  return booking.booking_origin === "corporate" ||
    booking.booking_source === "corporate-direct" ||
    Boolean(booking.corporate_request_id)
    ? "corporate"
    : "standard";
}

function getAuditOnlyReceiptAmount(
  amountPaid: number,
  paymentAmount: number,
  audits: Array<{ after_values: unknown; before_values: unknown }>,
) {
  let auditAmount = 0;
  for (const audit of audits) {
    const before = Number((audit.before_values as Record<string, unknown> | null)?.amount_paid ?? 0);
    const after = Number((audit.after_values as Record<string, unknown> | null)?.amount_paid ?? 0);
    auditAmount = Math.max(0, Math.round((auditAmount + after - before) * 100) / 100);
  }

  return paymentAmount + auditAmount <= Number(amountPaid) + 0.005
    ? auditAmount
    : 0;
}

export async function loadBookingManagementContext(
  serviceClient: SupabaseClient,
  bookingReference: string,
  now = new Date(),
) {
  const { data: rawBooking, error: bookingError } = await serviceClient
    .from("bookings")
    .select("id,customer_id,show_id,booking_reference,booking_source,booking_origin,corporate_request_id,guest_count,booking_status,payment_status,section,zone_entitlements,total_amount,amount_paid,balance_outstanding,notes,archived_at,updated_at")
    .eq("booking_reference", bookingReference)
    .maybeSingle();
  if (bookingError) throw bookingError;
  if (!rawBooking) return null;
  const booking = rawBooking as BookingRow;

  const [showResult, paymentResult, refundResult, auditResult] = await Promise.all([
    serviceClient.from("shows").select("id,name,date,time,venue,status").eq("id", booking.show_id).maybeSingle(),
    serviceClient.from("payments").select("id,amount,method,payment_status,provider_gross_amount,provider_transaction_id,transaction_fee_amount").eq("booking_id", booking.id),
    serviceClient.from("payment_refunds").select("refund_amount,refund_status").eq("booking_id", booking.id),
    serviceClient.from("audit_events").select("before_values,after_values").eq("entity_reference", booking.booking_reference).eq("outcome", "success").in("action", ["booking.payment-edit", "booking.financial-reconciliation", "booking.payment-recorded"]),
  ]);
  const error = showResult.error ?? paymentResult.error ?? refundResult.error ?? auditResult.error;
  if (error) throw error;
  if (!showResult.data) return null;

  const payments = (paymentResult.data ?? []).map((row) => ({
    amount: Number(row.amount ?? 0),
    id: row.id,
    method: row.method,
    paymentStatus: row.payment_status,
    providerGrossAmount: row.provider_gross_amount == null ? null : Number(row.provider_gross_amount),
    providerTransactionId: row.provider_transaction_id,
    transactionFeeAmount: row.transaction_fee_amount == null ? null : Number(row.transaction_fee_amount),
  })) satisfies BookingManagementPayment[];
  const refunds = (refundResult.data ?? []).map((row) => ({
    amount: Number(row.refund_amount ?? 0),
    status: row.refund_status,
  })) satisfies BookingManagementRefund[];
  const paymentAmount = payments
    .filter((payment) => ["deposit_paid", "fully_paid"].includes(payment.paymentStatus))
    .reduce((total, payment) => total + payment.amount, 0);
  const manualReceiptAmount = getAuditOnlyReceiptAmount(
    booking.amount_paid,
    paymentAmount,
    auditResult.data ?? [],
  );
  const metadata = parseMetadata(booking.notes);
  const bookingKind = getBookingKind(booking);
  const show = showResult.data as ShowRow;
  const depositAmount = getDepositAmount(metadata, booking);
  const policy = resolveBookingCancellationPolicy({
    bookingFeeAmount: booking.total_amount > 0 ? includedBookingFeeAmount : 0,
    bookingKind,
    depositAmount,
    manualReceiptAmount,
    now,
    payments,
    performanceDate: show.date,
    performanceTime: show.time,
    refunds,
    totalAmount: Number(booking.total_amount),
  });
  const guestSelfServiceEligible =
    bookingKind === "standard" &&
    isGuestManageableStandardBooking({
      archivedAt: booking.archived_at,
      bookingOrigin: booking.booking_origin,
      bookingSource: booking.booking_source,
      bookingStatus: booking.booking_status,
      corporateRequestId: booking.corporate_request_id,
      now,
      paymentStatus: booking.payment_status,
      performanceDate: show.date,
      performanceTime: show.time,
    });
  const stateFingerprint = getBookingManagementStateFingerprint({
    bookingStatus: booking.booking_status,
    guestCount: booking.guest_count,
    paymentStatus: booking.payment_status,
    policy,
    showId: booking.show_id,
    updatedAt: booking.updated_at,
  });

  return {
    booking,
    bookingKind,
    depositAmount,
    guestSelfServiceEligible,
    metadata,
    policy,
    show,
    stateFingerprint,
    zoneId: normalizeBookingZone(booking.section),
  } satisfies BookingManagementContext;
}

export async function verifyBookingManagementMobile(
  serviceClient: SupabaseClient,
  context: BookingManagementContext,
  mobileNumber: string,
) {
  const supplied = normalizePhoneForComparison(mobileNumber);
  if (!supplied) return false;
  const { data, error } = await serviceClient
    .from("customers")
    .select("mobile")
    .eq("id", context.booking.customer_id)
    .maybeSingle();
  if (error) throw error;
  const authoritative =
    context.metadata?.customer.phone || data?.mobile || "";
  return supplied === normalizePhoneForComparison(authoritative);
}

export function toPublicCancellationPreview(context: BookingManagementContext) {
  return {
    bookingReference: context.booking.booking_reference,
    bookingStatus: context.booking.booking_status,
    cutoffAt: context.policy.cutoffAt,
    cutoffDays: context.policy.cutoffDays,
    depositAmount: context.policy.depositAmount,
    forfeitedAmount: context.policy.forfeitedAmount,
    fullRefundWindow: context.policy.fullRefundWindow,
    manualRefundRequired: context.policy.manualRefundRequired,
    paidAmount: context.policy.paidAmount,
    performance: {
      date: context.show.date,
      name: context.show.name,
      time: context.show.time.slice(0, 5),
      venue: context.show.venue,
    },
    policySummary: context.policy.policySummary,
    refundableAmount: context.policy.refundableAmount,
    refundState: context.policy.refundState,
    stateFingerprint: context.stateFingerprint,
    updatedAt: context.booking.updated_at,
  };
}
