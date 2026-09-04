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
  verifyPayFastItnSignature,
  verifyPayFastServerConfirmation,
  verifyPayFastSourceIp,
  type PayFastItnData,
} from "@/lib/payfast/itn";
import { recordPlatformEventBestEffort } from "@/lib/platformTelemetry";
import { getServiceClient } from "@/lib/supabase/serverAdmin";
import {
  sendGuestPushNotification,
  sendStaffPushNotification,
} from "@/lib/supabase/staffPush";
import type { SupabaseClient } from "@supabase/supabase-js";
import { calculatePayFastBookingReconciliation } from "@/lib/payfast/transactionFee";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type BookingRow = {
  amount_paid: number;
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
};

type PayFastCoreResult = {
  booking_was_confirmed?: boolean;
  booking_id?: string;
  payment_id?: string;
  status:
    | "already_confirmed"
    | "duplicate_provider_transaction"
    | "missing"
    | "processed";
  was_confirmed?: boolean;
};

type PaymentAmountRow = {
  amount: number | null;
  payment_status: string;
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
      "id,customer_id,show_id,booking_reference,booking_status,payment_status,total_amount,amount_paid,balance_outstanding,notes",
    )
    .eq("booking_reference", bookingReference)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as BookingRow | null;
}

async function loadShow(supabase: SupabaseClient, showId: string) {
  const { data, error } = await supabase
    .from("shows")
    .select("id,name,date,time")
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
) {
  const type = getSupabaseCommunicationType(trigger);
  const template = getCommunicationTemplate(templates, trigger, "email");

  if (!template) {
    return null;
  }

  const ticketEmail =
    trigger === "reservation-confirmed" && ticket
      ? await createZingaraTicketEmail({
          booking,
          qrPayload: ticket.qrPayload,
          show,
        })
      : null;
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
  const { data: claimData, error: claimError } = await supabase.rpc(
    "claim_email_communication_once",
    {
      p_booking_id: bookingId,
      p_customer_id: customerId,
      p_message: record.message,
      p_show_id: showId,
      p_subject: record.subject ?? null,
      p_type: type,
    },
  );

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
      status: coreResult.status,
      ticketCode,
      wasConfirmed: Boolean(coreResult.was_confirmed),
    };
  }

  const bookingId = coreResult.booking_id ?? row.id;
  const wasConfirmed =
    coreResult.status === "already_confirmed" || Boolean(coreResult.was_confirmed);
  const bookingWasConfirmed = Boolean(coreResult.booking_was_confirmed);

  const ensuredTicket = await ensureTicket(supabase, bookingId, updatedBooking);
  await ensureLifecycleEvent(supabase, bookingId, {
    createdAt: now,
    fromStatus: "pending_payment",
    note: `PayFast payment received: ${data.pf_payment_id ?? data.m_payment_id}`,
    toStatus: "confirmed",
  });
  await ensureLifecycleEvent(supabase, bookingId, {
    createdAt: now,
    fromStatus: "pending_payment",
    note: "Booking confirmed after PayFast ITN validation",
    toStatus: "confirmed",
  });

  const showRow = await loadShow(supabase, row.show_id);
  const show = toShow(showRow);
  const templates = await loadTemplates(supabase);

  await ensureCommunication(
    supabase,
    bookingId,
    row.customer_id,
    row.show_id,
    updatedBooking,
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
    updatedBooking,
    show,
    "payment-confirmation",
    templates,
  );

  if (!wasConfirmed) {
    if (!bookingWasConfirmed) {
      void sendGuestPushNotification({
        bookingReference: updatedBooking.reference,
        trigger: "reservation-confirmed",
      });
      void sendStaffPushNotification({
        bookingReference: updatedBooking.reference,
        trigger: "new-booking",
      });
    }
    void sendGuestPushNotification({
      bookingReference: updatedBooking.reference,
      trigger: "payment-received",
    });
    void sendStaffPushNotification({
      bookingReference: updatedBooking.reference,
      trigger: "payment-received",
    });
  }

  return {
    bookingReference: updatedBooking.reference,
    status: coreResult.status,
    ticketCode,
    wasConfirmed,
  };
}

export async function POST(request: Request) {
  const startedAt = Date.now();

  try {
    const rawBody = await request.text();
    const entries = Array.from(new URLSearchParams(rawBody).entries());
    const data = toItnData(entries);
    const bookingReference = getBookingReference(data);
    const config = getPayFastConfig();
    const supabase = getServiceClient();

    if (!supabase) {
      console.error("[Zingara PayFast] ITN blocked: Supabase service client missing");
      return Response.json({ ok: false }, { status: 200 });
    }

    if (!bookingReference) {
      console.error("[Zingara PayFast] ITN blocked: booking reference missing");
      return Response.json({ ok: false }, { status: 200 });
    }

    const bookingRow = await loadBooking(supabase, bookingReference);

    if (!bookingRow) {
      console.error("[Zingara PayFast] ITN blocked: booking not found", {
        bookingReference,
      });
      return Response.json({ ok: false }, { status: 200 });
    }

    const booking = parseBookingMetadata(bookingRow.notes);

    if (!booking) {
      await recordFailedItn(supabase, bookingRow.id, "booking metadata missing");
      return Response.json({ ok: false }, { status: 200 });
    }

    const pfParamString = createPayFastItnParamString(entries);
    const signatureValid = verifyPayFastItnSignature(
      data,
      pfParamString,
      config.passphrase || undefined,
    );
    const sourceIpValid = await verifyPayFastSourceIp(
      getPayFastRequestIp(request),
    );
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
      !paymentAmountValid ||
      !serverValidationValid
    ) {
      await recordFailedItn(
        supabase,
        bookingRow.id,
        JSON.stringify(validation),
      );
      return Response.json({ ok: false, validation }, { status: 200 });
    }

    if (data.payment_status !== "COMPLETE") {
      await recordFailedItn(
        supabase,
        bookingRow.id,
        `PayFast payment_status ${data.payment_status ?? "UNKNOWN"}`,
      );
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

      return Response.json({ ok: false, result, validation }, { status: 200 });
    }

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

    return Response.json(
      {
        ok: true,
        result,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("[Zingara PayFast] ITN processing failed", error);

    return Response.json({ ok: false }, { status: 200 });
  }
}
