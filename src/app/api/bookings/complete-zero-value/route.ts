import {
  type CommunicationRecord,
  type CommunicationTrigger,
  type DemoBooking,
  createTicketCode,
  defaultCommunicationTemplates,
  getCommunicationTemplate,
  getTicketUrl,
  normalizeShowLocation,
  renderCommunicationTemplate,
  createCommunicationRecord,
} from "@/lib/zingaraDemo";
import { sendOperationalCustomerEmail } from "@/lib/email/smtp";
import { createZingaraTicketEmail } from "@/lib/email/ticketEmail";
import {
  formatCustomerExperienceSchedule,
  getCustomerExperienceTimes,
} from "@/lib/experienceTimes";
import { loadServerVenueSettings } from "@/lib/supabase/serverVenueSettings";
import {
  recordPlatformEventBestEffort,
  recordPlatformFailureEventBestEffort,
} from "@/lib/platformTelemetry";
import {
  checkRateLimit,
  rateLimitResponse,
} from "@/lib/rateLimit";
import { getServiceClient } from "@/lib/supabase/serverAdmin";
import { requirePublicMaintenanceAvailable } from "@/lib/platformMaintenance";
import {
  sendGuestPushNotification,
  sendStaffPushNotification,
} from "@/lib/supabase/staffPush";
import type { SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type BookingRow = {
  balance_outstanding: number | null;
  booking_reference: string;
  booking_status: string;
  customer_id: string;
  id: string;
  notes: string | null;
  payment_status: string;
  show_id: string;
  total_amount: number | null;
};

type ShowRow = {
  date: string;
  id: string;
  name: string;
  time: string;
  venue: string | null;
};

type TemplateRow = {
  active: boolean;
  body: string;
  channel: "email";
  id: string;
  name: string;
  subject: string | null;
  type: string;
  updated_at: string;
};

type CommunicationClaimResult = {
  communication_id?: string | null;
  status: "claimed" | "sending" | "sent" | string;
};

const bookingMetadataPrefix = "__zingara_booking_meta__:";

function parseBookingMetadata(notes: string | null) {
  if (!notes?.startsWith(bookingMetadataPrefix)) {
    return null;
  }

  try {
    return JSON.parse(notes.slice(bookingMetadataPrefix.length)) as DemoBooking;
  } catch {
    return null;
  }
}

function serializeBookingMetadata(booking: DemoBooking) {
  return `${bookingMetadataPrefix}${JSON.stringify(booking)}`;
}

function toShow(row: ShowRow | null) {
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

function toTemplate(row: TemplateRow) {
  return {
    active: row.active,
    body: row.body,
    channel: row.channel,
    id: row.id,
    name: row.name,
    subject: row.subject ?? "",
    trigger:
      row.type === "reservation_confirmed"
        ? ("reservation-confirmed" as const)
        : row.type === "booking_confirmation"
          ? ("booking-confirmation" as const)
          : row.type === "payment_confirmation"
            ? ("payment-confirmation" as const)
            : ("custom-message" as const),
    updatedAt: row.updated_at,
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
      "id,customer_id,show_id,booking_reference,booking_status,payment_status,total_amount,balance_outstanding,notes",
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
    console.error("[Zingara Zero Value] Failed to load templates", error);
    return defaultCommunicationTemplates;
  }

  return (data as TemplateRow[] | null)?.map(toTemplate) ?? defaultCommunicationTemplates;
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
  const { error } = await supabase.rpc("ensure_booking_lifecycle_event_once", {
    p_booking_id: bookingId,
    p_created_at: event.createdAt,
    p_from_status: event.fromStatus ?? null,
    p_note: event.note,
    p_to_status: event.toStatus,
  });

  if (error) {
    throw error;
  }
}

async function ensureCommunication(
  supabase: SupabaseClient,
  bookingId: string,
  customerId: string,
  showId: string,
  booking: DemoBooking,
  show: ReturnType<typeof toShow>,
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
        normalizeShowLocation(show.location),
      )
    : null;
  const message = ticketEmail?.message ?? [
    renderCommunicationTemplate(template.body, booking, show),
    experienceTimes ? formatCustomerExperienceSchedule(experienceTimes) : "",
  ].filter(Boolean).join("\n\n");
  const record: CommunicationRecord = createCommunicationRecord({
    booking,
    channel: template.channel,
    message,
    subject:
      ticketEmail?.subject ??
      renderCommunicationTemplate(template.subject, booking, show),
    templateId: template.id,
    trigger,
  });
  const { data: existingRows, error: existingError } = await supabase
    .from("communications")
    .select("id,status")
    .eq("booking_id", bookingId)
    .eq("customer_id", customerId)
    .eq("show_id", showId)
    .eq("type", type)
    .eq("channel", "email")
    .in("status", ["failed", "sending", "sent", "suppressed"])
    .order("created_at", { ascending: true })
    .limit(1);

  if (existingError) {
    throw existingError;
  }

  const existingCommunication = (
    existingRows as Array<{ id?: string; status?: string }> | null
  )?.[0];

  if (existingCommunication?.id) {
    return existingCommunication.id;
  }

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
    kind: "booking_confirmation",
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
      status: result.ok ? "sent" : result.suppressed ? "suppressed" : "failed",
    })
    .eq("id", claim.communication_id)
    .select("id")
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as { id?: string } | null)?.id;
}

function getAuthoritativePayableAmount(row: BookingRow) {
  return Math.round(
    Math.max(
      Number(row.balance_outstanding ?? row.total_amount ?? 0) || 0,
      0,
    ) * 100,
  );
}

async function completeZeroValueBooking(
  supabase: SupabaseClient,
  row: BookingRow,
  booking: DemoBooking,
) {
  const now = new Date().toISOString();
  const ticketCode = booking.ticketCode ?? createTicketCode(booking.reference);
  const updatedBooking = {
    ...booking,
    amountPaid: 0,
    balanceDue: 0,
    paymentDate: now,
    paymentStatus: "fully-paid",
    status: "confirmed",
    ticketCode,
    ticketIssuedAt: booking.ticketIssuedAt ?? now,
  } as DemoBooking & { paymentDate?: string };

  const { data: updatedRows, error: updateError } = await supabase
    .from("bookings")
    .update({
      amount_paid: 0,
      balance_outstanding: 0,
      booking_status: "confirmed",
      notes: serializeBookingMetadata(updatedBooking),
      payment_status: "fully_paid",
      updated_at: now,
    })
    .eq("id", row.id)
    .eq("booking_status", "pending_payment")
    .select("id");

  if (updateError) {
    throw updateError;
  }

  const didTransition = (updatedRows ?? []).length > 0;

  const { data: paymentRows, error: paymentLoadError } = await supabase
    .from("payments")
    .select("id,payment_status")
    .eq("booking_id", row.id)
    .order("created_at", { ascending: true })
    .limit(1);

  if (paymentLoadError) {
    throw paymentLoadError;
  }

  const paymentId = (paymentRows?.[0] as { id?: string } | undefined)?.id;

  if (paymentId) {
    const { error: paymentUpdateError } = await supabase
      .from("payments")
      .update({
        amount: 0,
        method: "platform",
        notes: "Zero-value booking completed through valid promo code.",
        payment_status: "fully_paid",
        payment_type: "full_payment",
        processed_at: now,
        reference: row.booking_reference,
      })
      .eq("id", paymentId)
      .eq("payment_status", "pending_payment");

    if (paymentUpdateError) {
      throw paymentUpdateError;
    }
  } else {
    const { error: paymentInsertError } = await supabase
      .from("payments")
      .insert({
        amount: 0,
        booking_id: row.id,
        method: "platform",
        notes: "Zero-value booking completed through valid promo code.",
        payment_status: "fully_paid",
        payment_type: "full_payment",
        processed_at: now,
        reference: row.booking_reference,
      });

    if (paymentInsertError) {
      throw paymentInsertError;
    }
  }

  const ensuredTicket = await ensureTicket(supabase, row.id, updatedBooking);
  await ensureLifecycleEvent(supabase, row.id, {
    createdAt: now,
    fromStatus: "pending_payment",
    note: "Zero-value booking completed with server-authoritative pricing",
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
    ensuredTicket,
  );

  return {
    booking: updatedBooking,
    didTransition,
    ticketCode,
    wasAlreadyConfirmed: false,
  };
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  const supabase = getServiceClient();

  if (!supabase) {
    return Response.json(
      { error: "Booking completion is temporarily unavailable." },
      { status: 503 },
    );
  }

  const maintenanceResponse = await requirePublicMaintenanceAvailable(
    supabase,
    "booking",
  );

  if (maintenanceResponse) return maintenanceResponse;

  try {
    const body = (await request.json().catch(() => ({}))) as {
      bookingReference?: string;
      journeyId?: string | null;
    };
    const bookingReference = body.bookingReference?.trim();

    if (!bookingReference) {
      return Response.json(
        { error: "Booking reference is required." },
        { status: 400 },
      );
    }

    const limit = await checkRateLimit(
      request,
      {
        limit: 8,
        scope: "zero_value_booking_completion_reference",
        windowSeconds: 300,
      },
      [bookingReference],
      supabase,
    );

    if (!limit.allowed) {
      return rateLimitResponse(
        limit.retryAfterSeconds,
        {
          bookingReference,
          journeyId: body.journeyId ?? null,
          operation: "complete_zero_value_booking",
          route: "/api/bookings/complete-zero-value",
          safeFingerprint: "zero_value_completion_rate_limited",
        },
        supabase,
      );
    }

    const row = await loadBooking(supabase, bookingReference);

    if (!row) {
      return Response.json(
        { error: "Booking could not be found." },
        { status: 404 },
      );
    }

    const authoritativePayableCents = getAuthoritativePayableAmount(row);

    if (authoritativePayableCents > 0) {
      return Response.json(
        { error: "This booking still requires secure payment." },
        { status: 409 },
      );
    }

    const booking = parseBookingMetadata(row.notes);

    if (!booking) {
      return Response.json(
        { error: "Booking completion data could not be resolved." },
        { status: 409 },
      );
    }

    if (
      row.booking_status === "confirmed" &&
      row.payment_status !== "pending_payment"
    ) {
      return Response.json({
        booking,
        status: "already_confirmed",
        ticketCode: booking.ticketCode ?? createTicketCode(booking.reference),
      });
    }

    const result = await completeZeroValueBooking(supabase, row, booking);

    recordPlatformEventBestEffort(
      {
        bookingReference,
        durationMs: Date.now() - startedAt,
        eventType: "booking_completed",
        journeyId: body.journeyId ?? null,
        metadata: {
          source: "zero-value-promo",
        },
        operation: "complete_zero_value_booking",
        route: "/api/bookings/complete-zero-value",
        statusCode: 200,
      },
      supabase,
    );
    if (result.didTransition) {
      void sendGuestPushNotification({
        bookingReference,
        trigger: "reservation-confirmed",
      });
      void sendStaffPushNotification({
        bookingReference,
        trigger: "new-booking",
      });
    }

    return Response.json({
      booking: result.booking,
      status: "confirmed",
      ticketCode: result.ticketCode,
    });
  } catch (error) {
    console.error("[Zingara Zero Value] Booking completion failed", error);
    recordPlatformFailureEventBestEffort(
      {
        operation: "complete_zero_value_booking",
        route: "/api/bookings/complete-zero-value",
        safeFingerprint: "zero_value_completion_failed",
        service: "BOOKING API",
        statusCode: 500,
        summary: "Zero-value booking completion failed.",
      },
      supabase,
    );

    return Response.json(
      { error: "Booking could not be completed." },
      { status: 500 },
    );
  }
}
