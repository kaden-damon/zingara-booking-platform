import {
  createCommunicationRecord,
  createTicketCode,
  defaultCommunicationTemplates,
  getCommunicationTemplate,
  getTicketUrl,
  normalizeShowLocation,
  renderCommunicationTemplate,
  type CommunicationChannel,
  type CommunicationRecord,
  type CommunicationTrigger,
  type DemoBooking,
  type DemoShow,
  type PaymentOption,
} from "@/lib/zingaraDemo";
import { sendOperationalCustomerEmail } from "@/lib/email/smtp";
import { createZingaraTicketEmail } from "@/lib/email/ticketEmail";
import {
  formatCustomerExperienceSchedule,
  getCustomerExperienceTimes,
} from "@/lib/experienceTimes";
import { loadServerVenueSettings } from "@/lib/supabase/serverVenueSettings";
import { getPayFastConfig } from "@/lib/payfast/config";
import {
  createPayFastItnParamString,
  getPayFastRequestIp,
  PayFastTransientValidationError,
  verifyPayFastItnSignature,
  verifyPayFastServerConfirmation,
  verifyPayFastSourceIp,
  type PayFastItnData,
} from "@/lib/payfast/itn";
import { createHash } from "node:crypto";
import { recordPlatformEventBestEffort } from "@/lib/platformTelemetry";
import { getServiceClient } from "@/lib/supabase/serverAdmin";
import {
  sendGuestPushNotification,
  sendStaffPushNotification,
} from "@/lib/supabase/staffPush";
import type { SupabaseClient } from "@supabase/supabase-js";
import { calculatePayFastBookingReconciliation } from "@/lib/payfast/transactionFee";
import { releaseValidatedFailedPublicPaymentHold } from "@/lib/workflows/publicPaymentHolds";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type BookingRow = {
  amount_paid: number;
  archive_reason: string | null;
  archived_at: string | null;
  balance_outstanding: number;
  booking_reference: string;
  booking_status: "confirmed" | "pending_payment" | string;
  customer_id: string;
  id: string;
  notes: string | null;
  payment_status: "deposit_paid" | "fully_paid" | "pending_payment" | string;
  show_id: string;
  total_amount: number;
};

type PaymentStatus = "deposit_paid" | "fully_paid";

type TemplateRow = {
  active: boolean;
  body: string;
  channel: "email" | "internal_note" | "push" | "sms" | "whatsapp";
  id: string;
  name: string;
  subject: string;
  type: string;
  updated_at?: string;
};

type ShowRow = {
  date: string;
  id: string;
  name: string;
  time: string;
  venue: string | null;
};

type PayFastCoreResult = {
  amount_paid?: number;
  archived_at?: string | null;
  balance_outstanding?: number;
  booking_was_confirmed?: boolean;
  booking_id?: string;
  payment_id?: string;
  status:
    | "already_confirmed"
    | "duplicate_provider_transaction"
    | "missing"
    | "processed";
  restoration_status?: string;
  was_confirmed?: boolean;
};

type PaymentAmountRow = {
  amount: number | null;
  id?: string;
  payment_status: string;
  processed_at?: string | null;
  provider_gross_amount: number | null;
  provider_transaction_id: string | null;
  transaction_fee_amount: number | null;
};

type PayFastTransactionAmounts = {
  bookingAppliedAmount: number;
  providerGrossAmount: number;
  transactionFeeAmount: number;
};

type CommunicationClaimResult = {
  communication_id?: string;
  status: "claimed" | "failed" | "sending" | "sent";
};

type PayFastReceiptRow = {
  id: string;
  processing_status: string;
};

const bookingMetadataPrefix = "__zingara_booking_meta__:";

function parseBookingMetadata(notes: string | null) {
  if (!notes?.startsWith(bookingMetadataPrefix)) {
    return null;
  }

  try {
    return JSON.parse(notes.slice(bookingMetadataPrefix.length)) as DemoBooking;
  } catch (error) {
    console.error("[Zingara PayFast] Failed to parse booking metadata", error);
    return null;
  }
}

function serializeBookingMetadata(booking: DemoBooking) {
  return `${bookingMetadataPrefix}${JSON.stringify(booking)}`;
}

function toItnData(entries: Array<[string, string]>) {
  return entries.reduce<PayFastItnData>((data, [key, value]) => {
    data[key] = value;
    return data;
  }, {});
}

function getBookingReference(data: PayFastItnData) {
  return data.m_payment_id || data.custom_str1;
}

function getPaymentAmount(data: PayFastItnData) {
  return Number.parseFloat(data.amount_gross || data.amount_net || "0");
}

function getOptionalAmount(value: string | undefined) {
  const amount = value === undefined ? Number.NaN : Number.parseFloat(value);
  return Number.isFinite(amount) ? amount : null;
}

function getReceiptEvidence(data: PayFastItnData) {
  return {
    customString1: data.custom_str1 ?? null,
    customString2: data.custom_str2 ?? null,
    itemDescription: data.item_description ?? null,
    itemName: data.item_name ?? null,
  };
}

async function recordItnReceipt(
  supabase: SupabaseClient,
  rawBody: string,
  data: PayFastItnData,
  requestIp: string | undefined,
) {
  const receiptHash = createHash("sha256").update(rawBody).digest("hex");
  const { data: receipt, error } = await supabase.rpc(
    "record_payfast_itn_receipt",
    {
      p_amount_fee: getOptionalAmount(data.amount_fee),
      p_amount_gross: getOptionalAmount(data.amount_gross),
      p_amount_net: getOptionalAmount(data.amount_net),
      p_evidence: getReceiptEvidence(data),
      p_merchant_id: data.merchant_id ?? null,
      p_merchant_payment_id: getBookingReference(data) ?? null,
      p_payment_status: data.payment_status ?? null,
      p_provider_transaction_id: data.pf_payment_id ?? null,
      p_receipt_hash: receiptHash,
      p_request_ip: requestIp ?? null,
      p_signature: data.signature ?? null,
    },
  );

  if (error || !receipt) {
    throw error ?? new Error("PayFast ITN receipt could not be persisted");
  }

  return receipt as PayFastReceiptRow;
}

async function markItnReceipt(
  supabase: SupabaseClient,
  receiptId: string,
  input: {
    amountValid?: boolean | null;
    failureCode?: string | null;
    failureDetail?: string | null;
    merchantValid?: boolean | null;
    paymentId?: string | null;
    processingStatus: PayFastReceiptRow["processing_status"];
    serverValidationValid?: boolean | null;
    signatureValid?: boolean | null;
    sourceValid?: boolean | null;
  },
) {
  const { error } = await supabase.rpc("mark_payfast_itn_receipt", {
    p_amount_valid: input.amountValid ?? null,
    p_failure_code: input.failureCode ?? null,
    p_failure_detail: input.failureDetail ?? null,
    p_merchant_valid: input.merchantValid ?? null,
    p_payment_id: input.paymentId ?? null,
    p_processing_status: input.processingStatus,
    p_receipt_id: receiptId,
    p_server_validation_valid: input.serverValidationValid ?? null,
    p_signature_valid: input.signatureValid ?? null,
    p_source_valid: input.sourceValid ?? null,
  });

  if (error) {
    throw error;
  }
}

function toStoredTransactionAmounts(payment: PaymentAmountRow) {
  const bookingAppliedAmount = Math.max(Number(payment.amount) || 0, 0);
  const transactionFeeAmount = Math.max(
    Number(payment.transaction_fee_amount) || 0,
    0,
  );

  return {
    bookingAppliedAmount,
    providerGrossAmount:
      payment.provider_gross_amount === null
        ? bookingAppliedAmount
        : Math.max(Number(payment.provider_gross_amount) || 0, 0),
    transactionFeeAmount,
  } satisfies PayFastTransactionAmounts;
}

async function getExpectedPayFastAmounts(
  supabase: SupabaseClient,
  data: PayFastItnData,
  booking: DemoBooking,
  row: BookingRow,
) {
  if (data.pf_payment_id) {
    const { data: confirmedPayment, error } = await supabase
      .from("payments")
      .select("amount,payment_status,provider_gross_amount,provider_transaction_id,transaction_fee_amount")
      .eq("booking_id", row.id)
      .eq("provider_transaction_id", data.pf_payment_id)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (confirmedPayment) {
      return toStoredTransactionAmounts(confirmedPayment as PaymentAmountRow);
    }
  }

  const { data: pendingPayment, error } = await supabase
    .from("payments")
    .select("amount,payment_status,provider_gross_amount,provider_transaction_id,transaction_fee_amount")
    .eq("booking_id", row.id)
    .eq("payment_status", "pending_payment")
    .is("provider_transaction_id", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (pendingPayment && Number((pendingPayment as PaymentAmountRow).amount) > 0) {
    return toStoredTransactionAmounts(pendingPayment as PaymentAmountRow);
  }

  const total = booking.totalPrice || row.total_amount || 0;

  if (booking.paymentOption === "deposit") {
    const bookingAppliedAmount = Number(
      ((total * (booking.depositPercentage ?? 50)) / 100).toFixed(2),
    );

    return {
      bookingAppliedAmount,
      providerGrossAmount: bookingAppliedAmount,
      transactionFeeAmount: 0,
    };
  }

  const bookingAppliedAmount = Number(total.toFixed(2));

  return {
    bookingAppliedAmount,
    providerGrossAmount: bookingAppliedAmount,
    transactionFeeAmount: 0,
  };
}

function getPaymentOutcome(
  booking: DemoBooking,
  amountPaid: number,
  row: BookingRow,
) {
  const total = booking.totalPrice || row.total_amount || amountPaid;
  const previousAmountPaid = Math.max(Number(row.amount_paid) || 0, 0);
  const reconciliation = calculatePayFastBookingReconciliation(
    total,
    previousAmountPaid,
    amountPaid,
  );
  const cumulativeAmountPaid = reconciliation.amountPaid;
  const balanceDue = reconciliation.outstandingAmount;
  const paymentStatus: PaymentStatus =
    balanceDue > 0
      ? "deposit_paid"
      : "fully_paid";

  return {
    amountPaid: cumulativeAmountPaid,
    balanceDue,
    paymentStatus,
    paymentStatusForBooking:
      paymentStatus === "deposit_paid" ? "deposit-paid" : "fully-paid",
    paymentType: previousAmountPaid > 0
      ? ("balance" as const)
      : paymentStatus === "deposit_paid"
        ? ("deposit" as const)
        : ("full_payment" as const),
    total,
  };
}

function toCommunicationTrigger(type: string): CommunicationTrigger {
  if (type === "reservation_confirmed") {
    return "reservation-confirmed";
  }

  if (type === "payment_confirmation") {
    return "payment-confirmation";
  }

  if (type === "booking_confirmation") {
    return "booking-confirmation";
  }

  if (type === "reservation_pending") {
    return "reservation-pending";
  }

  if (type === "complimentary_booking") {
    return "complimentary-booking";
  }

  if (type === "corporate_tentative_booking") {
    return "corporate-tentative-booking";
  }

  if (type === "show_reminder") {
    return "show-reminder";
  }

  if (type === "refund_notice") {
    return "cancellation-refund";
  }

  if (type === "operational_broadcast") {
    return "operational-broadcast";
  }

  return "custom-message";
}

function toCommunicationChannel(channel: TemplateRow["channel"]) {
  if (channel === "internal_note" || channel === "whatsapp") {
    return "email";
  }

  return channel as CommunicationChannel;
}

function toTemplate(row: TemplateRow) {
  const defaultTemplate = defaultCommunicationTemplates.find(
    (template) => template.name === row.name,
  );

  return {
    body: row.body,
    channel: toCommunicationChannel(row.channel),
    id: defaultTemplate?.id ?? `${row.channel}-${row.type}-${row.id}`,
    name: row.name,
    subject: row.subject,
    trigger: defaultTemplate?.trigger ?? toCommunicationTrigger(row.type),
    updatedAt: row.updated_at ?? new Date().toISOString(),
  };
}

function toShow(row: ShowRow | null): DemoShow | undefined {
  if (!row) {
    return undefined;
  }

  return {
    date: row.date,
    id: row.id,
    label: row.name,
    location: normalizeShowLocation(row.venue) ?? undefined,
    time: row.time.slice(0, 5),
  };
}

function getSupabaseCommunicationType(trigger: CommunicationTrigger) {
  if (trigger === "reservation-confirmed") {
    return "reservation_confirmed";
  }

  if (trigger === "payment-confirmation") {
    return "payment_confirmation";
  }

  if (trigger === "booking-confirmation") {
    return "booking_confirmation";
  }

  return "custom_message";
}

async function loadBooking(
  supabase: SupabaseClient,
  bookingReference: string,
) {
  const { data, error } = await supabase
    .from("bookings")
    .select(
      "id,customer_id,show_id,booking_reference,booking_status,payment_status,total_amount,amount_paid,balance_outstanding,notes,archived_at,archive_reason",
    )
    .eq("booking_reference", bookingReference)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as BookingRow | null;
}

async function loadPersistedPayment(
  supabase: SupabaseClient,
  bookingId: string,
  paymentId: string | undefined,
  providerTransactionId: string | undefined,
) {
  let query = supabase
    .from("payments")
    .select(
      "id,amount,payment_status,processed_at,provider_gross_amount,provider_transaction_id,transaction_fee_amount",
    )
    .eq("booking_id", bookingId);

  if (paymentId) {
    query = query.eq("id", paymentId);
  } else if (providerTransactionId) {
    query = query.eq("provider_transaction_id", providerTransactionId);
  } else {
    throw new Error("Persisted PayFast payment identity is missing");
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error("Persisted PayFast payment could not be reloaded");
  }

  return data as PaymentAmountRow;
}

function toAuthoritativeBooking(
  fallback: DemoBooking,
  row: BookingRow,
  payment: PaymentAmountRow,
) {
  const fallbackWithPayment = fallback as DemoBooking & {
    paymentDate?: string;
    transactionReference?: string;
  };
  const stored = parseBookingMetadata(row.notes) ?? fallback;
  const paymentStatus =
    row.payment_status === "fully_paid" ? "fully-paid" : "deposit-paid";
  const status = row.booking_status.replaceAll("_", "-");
  const transaction = toStoredTransactionAmounts(payment);

  return {
    ...stored,
    amountPaid: Number(row.amount_paid) || 0,
    balanceDue: Number(row.balance_outstanding) || 0,
    lastBookingAppliedAmount: transaction.bookingAppliedAmount,
    lastProviderGrossAmount: transaction.providerGrossAmount,
    lastTransactionFeeAmount: transaction.transactionFeeAmount,
    paymentDate:
      payment.processed_at ??
      (stored as typeof fallbackWithPayment).paymentDate,
    paymentStatus,
    status,
    totalPrice: Number(row.total_amount) || stored.totalPrice,
    transactionReference:
      payment.provider_transaction_id ??
      (stored as typeof fallbackWithPayment).transactionReference,
  } as DemoBooking & {
    paymentDate?: string;
    transactionReference?: string;
  };
}

async function loadShow(supabase: SupabaseClient, showId: string) {
  const { data, error } = await supabase
    .from("shows")
    .select("id,name,date,time,venue")
    .eq("id", showId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as ShowRow | null;
}

async function loadTemplates(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("communication_templates")
    .select("id,name,type,channel,subject,body,active,updated_at")
    .eq("active", true);

  if (error) {
    console.error("[Zingara PayFast] Failed to load templates", error);
    return defaultCommunicationTemplates;
  }

  return (data as TemplateRow[] | null)?.map(toTemplate) ?? defaultCommunicationTemplates;
}

function createPayFastPaymentNotes(data: PayFastItnData) {
  return [
    `PayFast payment_status: ${data.payment_status ?? "UNKNOWN"}`,
    data.pf_payment_id ? `PayFast transaction: ${data.pf_payment_id}` : "",
    data.amount_gross ? `Gross: ${data.amount_gross}` : "",
    data.amount_fee ? `PayFast processor fee: ${data.amount_fee}` : "",
    data.amount_net ? `Net: ${data.amount_net}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function confirmPaymentCore(
  supabase: SupabaseClient,
  booking: DemoBooking,
  status: PaymentStatus,
  amount: number,
  paymentType: "balance" | "deposit" | "full_payment",
  amountPaid: number,
  balanceDue: number,
  data: PayFastItnData,
  updatedBooking: DemoBooking,
) {
  const { data: coreResult, error } = await supabase.rpc(
    "confirm_payfast_payment_core",
    {
      p_amount: amount,
      p_amount_paid: amountPaid,
      p_balance_outstanding: balanceDue,
      p_booking_notes: serializeBookingMetadata(updatedBooking),
      p_booking_reference: booking.reference,
      p_payment_notes: createPayFastPaymentNotes(data),
      p_payment_status: status,
      p_payment_type: paymentType,
      p_provider_transaction_id: data.pf_payment_id ?? null,
    },
  );

  if (error) {
    throw error;
  }

  return coreResult as PayFastCoreResult;
}

async function ensureTicket(
  supabase: SupabaseClient,
  bookingId: string,
  booking: DemoBooking,
) {
  const ticketCode = booking.ticketCode ?? createTicketCode(booking.reference);
  const { data: rows, error: loadError } = await supabase
    .from("tickets")
    .select("id,ticket_code,qr_payload")
    .eq("ticket_code", ticketCode)
    .limit(1);

  if (loadError) {
    throw loadError;
  }

  const existingTicket = rows?.[0] as
    | { id?: string; qr_payload?: string; ticket_code?: string }
    | undefined;

  if (existingTicket?.id) {
    return {
      id: existingTicket.id,
      qrPayload: existingTicket.qr_payload ?? ticketCode,
      ticketCode: existingTicket.ticket_code ?? ticketCode,
    };
  }

  const { data, error } = await supabase
    .from("tickets")
    .insert({
      booking_id: bookingId,
      issued_at: booking.ticketIssuedAt ?? new Date().toISOString(),
      qr_payload: ticketCode,
      ticket_code: ticketCode,
      ticket_status: "valid",
      ticket_url: getTicketUrl(booking.reference),
    })
    .select("id,ticket_code,qr_payload")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      const { data: duplicate, error: reloadError } = await supabase
        .from("tickets")
        .select("id,ticket_code,qr_payload")
        .eq("ticket_code", ticketCode)
        .maybeSingle();

      if (reloadError) {
        throw reloadError;
      }

      return duplicate
        ? {
            id: duplicate.id,
            qrPayload: duplicate.qr_payload ?? ticketCode,
            ticketCode: duplicate.ticket_code ?? ticketCode,
          }
        : null;
    }

    throw error;
  }

  return data
    ? {
        id: data.id,
        qrPayload: data.qr_payload ?? ticketCode,
        ticketCode: data.ticket_code ?? ticketCode,
      }
    : null;
}

async function ensureLifecycleEvent(
  supabase: SupabaseClient,
  bookingId: string,
  event: {
    createdAt: string;
    fromStatus?: string | null;
    note: string;
    toStatus: string;
  },
) {
  const { data, error } = await supabase.rpc(
    "ensure_booking_lifecycle_event_once",
    {
      p_booking_id: bookingId,
      p_created_at: event.createdAt,
      p_from_status: event.fromStatus ?? null,
      p_note: event.note,
      p_to_status: event.toStatus,
    },
  );

  if (error) {
    throw error;
  }

  return data as string | null;
}

async function recordFailedItn(
  supabase: SupabaseClient,
  bookingId: string,
  reason: string,
) {
  await ensureLifecycleEvent(supabase, bookingId, {
    createdAt: new Date().toISOString(),
    fromStatus: "pending_payment",
    note: `PayFast ITN not confirmed: ${reason}`,
    toStatus: "pending_payment",
  });
}

async function ensureCommunication(
  supabase: SupabaseClient,
  bookingId: string,
  customerId: string,
  showId: string,
  booking: DemoBooking,
  show: DemoShow | undefined,
  trigger: CommunicationTrigger,
  templates: Awaited<ReturnType<typeof loadTemplates>>,
  ticket?: { qrPayload: string; ticketCode: string } | null,
  providerTransactionId?: string,
) {
  const type = getSupabaseCommunicationType(trigger);
  const template = getCommunicationTemplate(templates, trigger, "email");

  if (!template) {
    return null;
  }

  if (trigger === "payment-confirmation" && !providerTransactionId) {
    throw new Error(
      "Persisted provider transaction identity is required for payment email",
    );
  }

  let ticketEmail: Awaited<ReturnType<typeof createZingaraTicketEmail>> | null = null;

  try {
    ticketEmail =
      trigger === "reservation-confirmed" && ticket
        ? await createZingaraTicketEmail({
            booking,
            qrPayload: ticket.qrPayload,
            show,
          })
        : null;
  } catch (error) {
    const { data: claimData, error: claimError } = await supabase.rpc(
      "claim_email_communication_once",
      {
        p_booking_id: bookingId,
        p_customer_id: customerId,
        p_message:
          "Automatic booking confirmation could not be prepared. Use the audited manual resend control after reviewing the booking.",
        p_show_id: showId,
        p_subject: renderCommunicationTemplate(template.subject, booking, show),
        p_type: type,
      },
    );

    if (claimError) throw claimError;

    const claim = claimData as CommunicationClaimResult;

    if (claim.status === "claimed" && claim.communication_id) {
      const { error: updateError } = await supabase
        .from("communications")
        .update({ sent_at: null, status: "failed" })
        .eq("id", claim.communication_id);

      if (updateError) throw updateError;
    }

    console.error("[Zingara PayFast] Confirmation render failed", {
      bookingReference: booking.reference,
      error: error instanceof Error ? error.message : "Unknown render failure",
    });

    return claim.communication_id ?? null;
  }
  const experienceTimes = show
    ? getCustomerExperienceTimes(
        await loadServerVenueSettings(supabase),
        normalizeShowLocation(show.location ?? show.venueName ?? show.address),
      )
    : null;
  const renderedMessage = ticketEmail?.message ?? [
    renderCommunicationTemplate(template.body, booking, show),
    experienceTimes ? formatCustomerExperienceSchedule(experienceTimes) : "",
  ].filter(Boolean).join("\n\n");
  const paymentTransactionSummary =
    trigger === "payment-confirmation" &&
    typeof booking.lastProviderGrossAmount === "number" &&
    typeof booking.lastTransactionFeeAmount === "number"
      ? [
          `Applied to booking: R${(booking.lastBookingAppliedAmount ?? 0).toFixed(2)}`,
          `Transaction fee: R${booking.lastTransactionFeeAmount.toFixed(2)}`,
          `Total paid: R${booking.lastProviderGrossAmount.toFixed(2)}`,
        ].join("\n")
      : "";
  const record: CommunicationRecord = createCommunicationRecord({
    booking,
    channel: template.channel,
    message: paymentTransactionSummary
      ? `${renderedMessage}\n\n${paymentTransactionSummary}`
      : renderedMessage,
    subject:
      ticketEmail?.subject ??
      renderCommunicationTemplate(template.subject, booking, show),
    templateId: template.id,
    trigger,
  });
  const { data: claimData, error: claimError } =
    trigger === "payment-confirmation"
      ? await supabase.rpc("claim_payfast_payment_email_once", {
          p_booking_id: bookingId,
          p_customer_id: customerId,
          p_message: record.message,
          p_provider_transaction_id: providerTransactionId,
          p_show_id: showId,
          p_subject: record.subject ?? null,
        })
      : await supabase.rpc("claim_email_communication_once", {
          p_booking_id: bookingId,
          p_customer_id: customerId,
          p_message: record.message,
          p_show_id: showId,
          p_subject: record.subject ?? null,
          p_type: type,
        });

  if (claimError) {
    throw claimError;
  }

  const claim = claimData as CommunicationClaimResult;

  if (claim.status !== "claimed") {
    return claim.communication_id ?? null;
  }

  const result = await sendOperationalCustomerEmail({
    attachments: ticketEmail?.attachments,
    customerId,
    html: ticketEmail?.html,
    kind:
      trigger === "reservation-confirmed"
        ? "booking_confirmation"
        : "payment_confirmation",
    message: record.message,
    subject: record.subject,
    to: booking.customer.email,
  });

  if (!claim.communication_id) {
    throw new Error("Communication claim did not return an id");
  }

  const { data, error } = await supabase
    .from("communications")
    .update({
      sent_at: result.ok ? record.sentAt : null,
      status: result.ok ? "sent" : "failed",
    })
    .eq("id", claim.communication_id)
    .select("id")
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as { id?: string } | null)?.id;
}

async function confirmPayment(
  supabase: SupabaseClient,
  row: BookingRow,
  booking: DemoBooking,
  data: PayFastItnData,
  transaction: PayFastTransactionAmounts,
) {
  const now = new Date().toISOString();
  const outcome = getPaymentOutcome(
    booking,
    transaction.bookingAppliedAmount,
    row,
  );
  const ticketCode = booking.ticketCode ?? createTicketCode(booking.reference);
  const updatedBooking = {
    ...booking,
    amountPaid: outcome.amountPaid,
    balanceDue: outcome.balanceDue,
    lastBookingAppliedAmount: transaction.bookingAppliedAmount,
    lastProviderGrossAmount: transaction.providerGrossAmount,
    lastTransactionFeeAmount: transaction.transactionFeeAmount,
    paymentDate: now,
    paymentStatus: outcome.paymentStatusForBooking,
    status: "confirmed",
    ticketCode,
    ticketIssuedAt: booking.ticketIssuedAt ?? now,
    transactionReference: data.pf_payment_id,
  } as DemoBooking & {
    paymentDate?: string;
    transactionReference?: string;
  };
  const coreResult = await confirmPaymentCore(
    supabase,
    booking,
    outcome.paymentStatus,
    transaction.bookingAppliedAmount,
    outcome.paymentType,
    outcome.amountPaid,
    outcome.balanceDue,
    data,
    updatedBooking,
  );

  if (
    coreResult.status === "duplicate_provider_transaction" ||
    coreResult.status === "missing"
  ) {
    console.error("[Zingara PayFast] ITN core confirmation blocked", {
      bookingReference: booking.reference,
      status: coreResult.status,
    });

    return {
      bookingReference: booking.reference,
      paymentId: coreResult.payment_id,
      status: coreResult.status,
      ticketCode,
      wasConfirmed: Boolean(coreResult.was_confirmed),
    };
  }

  const bookingId = coreResult.booking_id ?? row.id;
  const [persistedRow, persistedPayment] = await Promise.all([
    loadBooking(supabase, booking.reference),
    loadPersistedPayment(
      supabase,
      bookingId,
      coreResult.payment_id,
      data.pf_payment_id,
    ),
  ]);

  if (!persistedRow) {
    throw new Error("Persisted booking could not be reloaded after PayFast confirmation");
  }

  const authoritativeBooking = toAuthoritativeBooking(
    booking,
    persistedRow,
    persistedPayment,
  );
  const restorationStatus =
    coreResult.restoration_status ??
    (persistedRow.archived_at ? "review_required" : "active");
  const isOperationallyActive =
    persistedRow.archived_at === null &&
    persistedRow.booking_status === "confirmed";
  const wasConfirmed =
    coreResult.status === "already_confirmed" || Boolean(coreResult.was_confirmed);
  const bookingWasConfirmed = Boolean(coreResult.booking_was_confirmed);

  if (!isOperationallyActive) {
    console.error("[Zingara PayFast] Payment persisted but booking requires lifecycle review", {
      bookingReference: booking.reference,
      restorationStatus,
    });

    return {
      bookingReference: booking.reference,
      paymentId: coreResult.payment_id,
      restorationStatus,
      status: coreResult.status,
      ticketCode,
      wasConfirmed,
    };
  }

  const ensuredTicket = await ensureTicket(
    supabase,
    bookingId,
    authoritativeBooking,
  );

  const showRow = await loadShow(supabase, row.show_id);
  const show = toShow(showRow);
  const templates = await loadTemplates(supabase);

  await ensureCommunication(
    supabase,
    bookingId,
    row.customer_id,
    row.show_id,
    authoritativeBooking,
    show,
    "reservation-confirmed",
    templates,
    ensuredTicket,
  );
  await ensureCommunication(
    supabase,
    bookingId,
    row.customer_id,
    row.show_id,
    authoritativeBooking,
    show,
    "payment-confirmation",
    templates,
    undefined,
    persistedPayment.provider_transaction_id ?? undefined,
  );

  if (!wasConfirmed) {
    if (!bookingWasConfirmed) {
      void sendGuestPushNotification({
        bookingReference: authoritativeBooking.reference,
        trigger: "reservation-confirmed",
      });
      void sendStaffPushNotification({
        bookingReference: authoritativeBooking.reference,
        trigger: "new-booking",
      });
    }
    void sendGuestPushNotification({
      bookingReference: authoritativeBooking.reference,
      trigger: "payment-received",
    });
    void sendStaffPushNotification({
      bookingReference: authoritativeBooking.reference,
      trigger: "payment-received",
    });
  }

  return {
    bookingReference: authoritativeBooking.reference,
    paymentId: coreResult.payment_id,
    restorationStatus,
    status: coreResult.status,
    ticketCode,
    wasConfirmed,
  };
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  let receiptId: string | null = null;
  let supabase: SupabaseClient | null = null;

  try {
    const rawBody = await request.text();
    const entries = Array.from(new URLSearchParams(rawBody).entries());
    const data = toItnData(entries);
    const bookingReference = getBookingReference(data);
    const config = getPayFastConfig();
    const requestIp = getPayFastRequestIp(request);
    supabase = getServiceClient();

    if (!supabase) {
      console.error("[Zingara PayFast] ITN blocked: Supabase service client missing");
      return Response.json({ ok: false }, { status: 503 });
    }

    const receipt = await recordItnReceipt(supabase, rawBody, data, requestIp);
    receiptId = receipt.id;

    if (receipt.processing_status === "processed") {
      return Response.json({ duplicate: true, ok: true }, { status: 200 });
    }

    await markItnReceipt(supabase, receiptId, {
      processingStatus: "processing",
    });

    if (!bookingReference) {
      console.error("[Zingara PayFast] ITN blocked: booking reference missing");
      await markItnReceipt(supabase, receiptId, {
        failureCode: "booking_reference_missing",
        processingStatus: "rejected",
      });
      return Response.json({ ok: false }, { status: 200 });
    }

    const bookingRow = await loadBooking(supabase, bookingReference);

    if (!bookingRow) {
      console.error("[Zingara PayFast] ITN blocked: booking not found", {
        bookingReference,
      });
      await markItnReceipt(supabase, receiptId, {
        failureCode: "booking_not_found",
        processingStatus: "rejected",
      });
      return Response.json({ ok: false }, { status: 200 });
    }

    const booking = parseBookingMetadata(bookingRow.notes);

    if (!booking) {
      await recordFailedItn(supabase, bookingRow.id, "booking metadata missing");
      await markItnReceipt(supabase, receiptId, {
        failureCode: "booking_metadata_missing",
        processingStatus: "rejected",
      });
      return Response.json({ ok: false }, { status: 200 });
    }

    const pfParamString = createPayFastItnParamString(entries);
    const signatureValid = verifyPayFastItnSignature(
      data,
      pfParamString,
      config.passphrase || undefined,
    );
    const merchantValid = data.merchant_id === config.merchantId;

    if (!signatureValid || !merchantValid) {
      await recordFailedItn(
        supabase,
        bookingRow.id,
        !signatureValid ? "signature invalid" : "merchant invalid",
      );
      await markItnReceipt(supabase, receiptId, {
        failureCode: !signatureValid ? "invalid_signature" : "invalid_merchant",
        merchantValid,
        processingStatus: "rejected",
        signatureValid,
      });
      return Response.json({ ok: false }, { status: 200 });
    }

    const sourceIpValid = await verifyPayFastSourceIp(requestIp);

    if (!sourceIpValid) {
      await recordFailedItn(supabase, bookingRow.id, "source invalid");
      await markItnReceipt(supabase, receiptId, {
        failureCode: "invalid_source",
        merchantValid,
        processingStatus: "rejected",
        signatureValid,
        sourceValid: false,
      });
      return Response.json({ ok: false }, { status: 200 });
    }

    const expectedTransaction = await getExpectedPayFastAmounts(
      supabase,
      data,
      booking,
      bookingRow,
    );
    const paymentAmount = getPaymentAmount(data);
    const paymentAmountValid =
      Math.abs(expectedTransaction.providerGrossAmount - paymentAmount) <= 0.01;
    const serverValidationValid = await verifyPayFastServerConfirmation(
      config,
      pfParamString,
    );
    const validation = {
      paymentAmount,
      paymentAmountValid,
      paymentStatus: data.payment_status ?? null,
      merchantValid,
      serverValidationValid,
      signatureValid,
      sourceIpValid,
    };

    console.info("[Zingara PayFast] ITN validation complete", {
      bookingReference,
      durationMs: Date.now() - startedAt,
      validation,
    });

    if (
      !signatureValid ||
      !sourceIpValid ||
      !merchantValid ||
      !paymentAmountValid ||
      !serverValidationValid
    ) {
      await recordFailedItn(
        supabase,
        bookingRow.id,
        JSON.stringify(validation),
      );
      await markItnReceipt(supabase, receiptId, {
        amountValid: paymentAmountValid,
        failureCode: !paymentAmountValid
          ? "amount_mismatch"
          : "provider_validation_rejected",
        merchantValid,
        processingStatus: "rejected",
        serverValidationValid,
        signatureValid,
        sourceValid: sourceIpValid,
      });
      return Response.json({ ok: false, validation }, { status: 200 });
    }

    if (data.payment_status !== "COMPLETE") {
      await recordFailedItn(
        supabase,
        bookingRow.id,
        `PayFast payment_status ${data.payment_status ?? "UNKNOWN"}`,
      );
      await releaseValidatedFailedPublicPaymentHold(
        supabase,
        bookingReference,
        data.payment_status,
      );
      await markItnReceipt(supabase, receiptId, {
        amountValid: paymentAmountValid,
        failureCode: `payment_status_${data.payment_status ?? "unknown"}`,
        merchantValid,
        processingStatus: "rejected",
        serverValidationValid,
        signatureValid,
        sourceValid: sourceIpValid,
      });
      return Response.json({ ok: false, validation }, { status: 200 });
    }

    const result = await confirmPayment(
      supabase,
      bookingRow,
      booking,
      data,
      expectedTransaction,
    );

    if (
      result.status === "duplicate_provider_transaction" ||
      result.status === "missing"
    ) {
      await recordFailedItn(
        supabase,
        bookingRow.id,
        `PayFast core confirmation ${result.status}`,
      );

      await markItnReceipt(supabase, receiptId, {
        amountValid: paymentAmountValid,
        failureCode: `core_${result.status}`,
        merchantValid,
        processingStatus:
          result.status === "missing" ? "retryable_failure" : "rejected",
        serverValidationValid,
        signatureValid,
        sourceValid: sourceIpValid,
      });

      return Response.json(
        { ok: false, result, validation },
        { status: result.status === "missing" ? 503 : 200 },
      );
    }

    await markItnReceipt(supabase, receiptId, {
      amountValid: paymentAmountValid,
      merchantValid,
      paymentId: result.paymentId ?? null,
      processingStatus: "processed",
      serverValidationValid,
      signatureValid,
      sourceValid: sourceIpValid,
    });

    const journeyId =
      typeof (booking as unknown as { journeyId?: unknown }).journeyId === "string"
        ? (booking as unknown as { journeyId: string }).journeyId
        : null;

    recordPlatformEventBestEffort(
      {
        bookingReference: result.bookingReference,
        durationMs: Date.now() - startedAt,
        eventType: "payment_confirmed",
        journeyId,
        metadata: {
          paymentStatus: data.payment_status ?? null,
          source: "payfast-itn",
        },
        operation: "confirm_payfast_itn",
        route: "/api/payfast/itn",
        statusCode: 200,
      },
      supabase,
    );
    if (result.restorationStatus === "active") {
      recordPlatformEventBestEffort(
        {
          bookingReference: result.bookingReference,
          durationMs: Date.now() - startedAt,
          eventType: "booking_completed",
          journeyId,
          metadata: {
            paymentStatus: data.payment_status ?? null,
            source: "payfast-itn",
          },
          operation: "complete_booking_from_itn",
          route: "/api/payfast/itn",
          statusCode: 200,
        },
        supabase,
      );
    }

    return Response.json(
      {
        ok: true,
        result,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("[Zingara PayFast] ITN processing failed", error);

    if (supabase && receiptId) {
      try {
        await markItnReceipt(supabase, receiptId, {
          failureCode:
            error instanceof PayFastTransientValidationError
              ? "provider_validation_unavailable"
              : "processing_failed",
          failureDetail:
            error instanceof Error ? error.message : "Unknown processing failure",
          processingStatus: "retryable_failure",
        });
      } catch (receiptError) {
        console.error(
          "[Zingara PayFast] Failed to update durable ITN receipt",
          receiptError,
        );
      }
    }

    return Response.json({ ok: false }, { status: 503 });
  }
}
