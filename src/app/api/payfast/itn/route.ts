import {
  createCommunicationRecord,
  createTicketCode,
  defaultCommunicationTemplates,
  getCommunicationTemplate,
  getTicketUrl,
  renderCommunicationTemplate,
  type CommunicationChannel,
  type CommunicationRecord,
  type CommunicationTrigger,
  type DemoBooking,
  type DemoShow,
  type PaymentOption,
} from "@/lib/zingaraDemo";
import { sendZingaraEmail } from "@/lib/email/smtp";
import { getPayFastConfig } from "@/lib/payfast/config";
import {
  createPayFastItnParamString,
  getPayFastRequestIp,
  verifyPayFastItnSignature,
  verifyPayFastServerConfirmation,
  verifyPayFastSourceIp,
  type PayFastItnData,
} from "@/lib/payfast/itn";
import { getServiceClient } from "@/lib/supabase/serverAdmin";
import {
  sendGuestPushNotification,
  sendStaffPushNotification,
} from "@/lib/supabase/staffPush";
import type { SupabaseClient } from "@supabase/supabase-js";

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

type PaymentRow = {
  id: string;
  payment_status: string;
};

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

function getExpectedPayFastAmount(booking: DemoBooking, row: BookingRow) {
  const total = booking.totalPrice || row.total_amount || 0;

  if (booking.paymentOption === "deposit") {
    return Number(
      ((total * (booking.depositPercentage ?? 50)) / 100).toFixed(2),
    );
  }

  return Number(total.toFixed(2));
}

function getPaymentOutcome(
  booking: DemoBooking,
  amountPaid: number,
  row: BookingRow,
) {
  const total = booking.totalPrice || row.total_amount || amountPaid;
  const balanceDue = Math.max(total - amountPaid, 0);
  const paymentStatus: PaymentStatus =
    booking.paymentOption === "deposit" && balanceDue > 0
      ? "deposit_paid"
      : "fully_paid";

  return {
    amountPaid,
    balanceDue,
    paymentStatus,
    paymentStatusForBooking:
      paymentStatus === "deposit_paid" ? "deposit-paid" : "fully-paid",
    paymentType:
      paymentStatus === "deposit_paid"
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

async function upsertPayment(
  supabase: SupabaseClient,
  bookingId: string,
  booking: DemoBooking,
  status: PaymentStatus,
  amount: number,
  paymentType: "deposit" | "full_payment",
  data: PayFastItnData,
) {
  const notes = [
    `PayFast payment_status: ${data.payment_status ?? "UNKNOWN"}`,
    data.pf_payment_id ? `PayFast transaction: ${data.pf_payment_id}` : "",
    data.amount_gross ? `Gross: ${data.amount_gross}` : "",
    data.amount_fee ? `Fee: ${data.amount_fee}` : "",
    data.amount_net ? `Net: ${data.amount_net}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const payload = {
    amount,
    booking_id: bookingId,
    method: "payfast",
    notes,
    payment_status: status,
    payment_type: paymentType,
    processed_at: new Date().toISOString(),
    reference: booking.reference,
  };
  const { data: rows, error: loadError } = await supabase
    .from("payments")
    .select("id,payment_status")
    .eq("booking_id", bookingId)
    .limit(1);

  if (loadError) {
    throw loadError;
  }

  const existing = (rows?.[0] as PaymentRow | undefined) ?? null;

  if (existing) {
    const { error } = await supabase
      .from("payments")
      .update(payload)
      .eq("id", existing.id);

    if (error) {
      throw error;
    }

    return existing.id;
  }

  const { data: inserted, error } = await supabase
    .from("payments")
    .insert(payload)
    .select("id")
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (inserted as { id?: string } | null)?.id;
}

async function ensureTicket(
  supabase: SupabaseClient,
  bookingId: string,
  booking: DemoBooking,
) {
  const ticketCode = booking.ticketCode ?? createTicketCode(booking.reference);
  const { data: rows, error: loadError } = await supabase
    .from("tickets")
    .select("id")
    .eq("ticket_code", ticketCode)
    .limit(1);

  if (loadError) {
    throw loadError;
  }

  const existingId = (rows?.[0] as { id?: string } | undefined)?.id;

  if (existingId) {
    return existingId;
  }

  const { data, error } = await supabase
    .from("tickets")
    .insert({
      booking_id: bookingId,
      issued_at: booking.ticketIssuedAt ?? new Date().toISOString(),
      qr_payload: getTicketUrl(booking.reference),
      ticket_code: ticketCode,
      ticket_status: "valid",
      ticket_url: getTicketUrl(booking.reference),
    })
    .select("id")
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as { id?: string } | null)?.id;
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
  const { data: rows, error: loadError } = await supabase
    .from("booking_lifecycle_events")
    .select("id")
    .eq("booking_id", bookingId)
    .eq("to_status", event.toStatus)
    .eq("note", event.note)
    .limit(1);

  if (loadError) {
    throw loadError;
  }

  const existingId = (rows?.[0] as { id?: string } | undefined)?.id;

  if (existingId) {
    return existingId;
  }

  const { data, error } = await supabase
    .from("booking_lifecycle_events")
    .insert({
      booking_id: bookingId,
      created_at: event.createdAt,
      from_status: event.fromStatus,
      note: event.note,
      to_status: event.toStatus,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as { id?: string } | null)?.id;
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
) {
  const type = getSupabaseCommunicationType(trigger);
  const { data: existingRows, error: loadError } = await supabase
    .from("communications")
    .select("id")
    .eq("booking_id", bookingId)
    .eq("channel", "email")
    .eq("type", type)
    .limit(1);

  if (loadError) {
    throw loadError;
  }

  const existingId = (existingRows?.[0] as { id?: string } | undefined)?.id;

  if (existingId) {
    return existingId;
  }

  const template = getCommunicationTemplate(templates, trigger, "email");

  if (!template) {
    return null;
  }

  const record: CommunicationRecord = createCommunicationRecord({
    booking,
    channel: template.channel,
    message: renderCommunicationTemplate(template.body, booking, show),
    subject: renderCommunicationTemplate(template.subject, booking, show),
    templateId: template.id,
    trigger,
  });
  const result = await sendZingaraEmail({
    message: record.message,
    subject: record.subject,
    to: booking.customer.email,
  });
  const { data, error } = await supabase
    .from("communications")
    .insert({
      booking_id: bookingId,
      channel: "email",
      customer_id: customerId,
      message: record.message,
      sent_at: record.sentAt,
      show_id: showId,
      status: result.ok ? "sent" : "failed",
      subject: record.subject ?? null,
      type,
    })
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
) {
  const now = new Date().toISOString();
  const amountPaid = getPaymentAmount(data);
  const outcome = getPaymentOutcome(booking, amountPaid, row);
  const ticketCode = booking.ticketCode ?? createTicketCode(booking.reference);
  const updatedBooking = {
    ...booking,
    amountPaid: outcome.amountPaid,
    balanceDue: outcome.balanceDue,
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
  const wasConfirmed =
    row.booking_status === "confirmed" &&
    row.payment_status !== "pending_payment";

  const { error: bookingError } = await supabase
    .from("bookings")
    .update({
      amount_paid: outcome.amountPaid,
      balance_outstanding: outcome.balanceDue,
      booking_status: "confirmed",
      notes: serializeBookingMetadata(updatedBooking),
      payment_status: outcome.paymentStatus,
      updated_at: now,
    })
    .eq("id", row.id);

  if (bookingError) {
    throw bookingError;
  }

  await upsertPayment(
    supabase,
    row.id,
    updatedBooking,
    outcome.paymentStatus,
    outcome.amountPaid,
    outcome.paymentType,
    data,
  );
  await ensureTicket(supabase, row.id, updatedBooking);
  await ensureLifecycleEvent(supabase, row.id, {
    createdAt: now,
    fromStatus: "pending_payment",
    note: `PayFast payment received: ${data.pf_payment_id ?? data.m_payment_id}`,
    toStatus: "confirmed",
  });
  await ensureLifecycleEvent(supabase, row.id, {
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
    row.id,
    row.customer_id,
    row.show_id,
    updatedBooking,
    show,
    "reservation-confirmed",
    templates,
  );
  await ensureCommunication(
    supabase,
    row.id,
    row.customer_id,
    row.show_id,
    updatedBooking,
    show,
    "payment-confirmation",
    templates,
  );

  if (!wasConfirmed) {
    void sendGuestPushNotification({
      bookingReference: updatedBooking.reference,
      trigger: "reservation-confirmed",
    });
    void sendGuestPushNotification({
      bookingReference: updatedBooking.reference,
      trigger: "payment-received",
    });
    void sendStaffPushNotification({
      bookingReference: updatedBooking.reference,
      trigger: "new-booking",
    });
    void sendStaffPushNotification({
      bookingReference: updatedBooking.reference,
      trigger: "payment-received",
    });
  }

  return {
    bookingReference: updatedBooking.reference,
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
    const expectedAmount = getExpectedPayFastAmount(booking, bookingRow);
    const paymentAmount = getPaymentAmount(data);
    const paymentAmountValid =
      Math.abs(expectedAmount - paymentAmount) <= 0.01;
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

    const result = await confirmPayment(supabase, bookingRow, booking, data);

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
