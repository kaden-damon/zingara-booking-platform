import {
  getRolePermissions,
  getServiceClient,
  requireActiveStaff,
} from "@/lib/supabase/serverAdmin";
import { sendOperationalCustomerEmail } from "@/lib/email/smtp";
import { createZingaraTicketEmail } from "@/lib/email/ticketEmail";
import type { OperationalCommunicationKind } from "@/lib/customerCommunicationPreferences";
import {
  findDuplicateSentCommunication,
  insertCommunicationPayload,
} from "@/lib/email/communicationIdempotency";
import {
  type CommunicationChannel,
  type CommunicationRecord,
  type CommunicationTrigger,
  type CorporateRequest,
  type DemoBooking,
  getGuestTicketsForBooking,
  getDisplayZoneTitle,
  normalizeShowLocation,
} from "@/lib/zingaraDemo";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireActiveStaff(request);

  if (!auth.staffProfile) {
    return auth.error;
  }

  const serviceClient = getServiceClient();

  if (!serviceClient) {
    return Response.json(
      { error: "Supabase service role is not configured." },
      { status: 500 },
    );
  }

  const { data, error } = await serviceClient
    .from("communications")
    .select(
      "id,customer_id,booking_id,show_id,batch_id,type,channel,subject,message,status,sent_at,created_at",
    )
    .order("sent_at", { ascending: false });

  if (error) {
    console.error("[Zingara API] Failed to load communications", error);

    return Response.json(
      { error: "Communications could not be loaded." },
      { status: 500 },
    );
  }

  return Response.json({ rows: data ?? [] });
}

type SupabaseCommunicationChannel =
  | "email"
  | "internal_note"
  | "push"
  | "sms"
  | "whatsapp";

type SupabaseCommunicationType =
  | "booking_confirmation"
  | "complimentary_booking"
  | "corporate_tentative_booking"
  | "custom_message"
  | "operational_broadcast"
  | "payment_confirmation"
  | "post_show_review"
  | "refund_notice"
  | "reservation_confirmed"
  | "reservation_pending"
  | "show_reminder";

function getRouteClient() {
  return getServiceClient();
}

function toSupabaseType(
  trigger?: CommunicationTrigger,
): SupabaseCommunicationType {
  if (trigger === "booking-confirmation") {
    return "booking_confirmation";
  }

  if (trigger === "payment-confirmation") {
    return "payment_confirmation";
  }

  if (trigger === "reservation-confirmed") {
    return "reservation_confirmed";
  }

  if (trigger === "reservation-pending") {
    return "reservation_pending";
  }

  if (trigger === "complimentary-booking") {
    return "complimentary_booking";
  }

  if (trigger === "corporate-tentative-booking") {
    return "corporate_tentative_booking";
  }

  if (trigger === "show-reminder") {
    return "show_reminder";
  }

  if (trigger === "post-show-review") {
    return "post_show_review";
  }

  if (trigger === "cancellation-refund") {
    return "refund_notice";
  }

  if (trigger === "operational-broadcast") {
    return "operational_broadcast";
  }

  return "custom_message";
}

function toSupabaseChannel(
  channel: CommunicationChannel,
): SupabaseCommunicationChannel {
  return channel;
}

function getOperationalCommunicationKind(
  trigger: CommunicationTrigger | undefined,
): OperationalCommunicationKind {
  if (trigger === "payment-confirmation") {
    return "payment_confirmation";
  }

  if (trigger === "cancellation-refund") {
    return "cancellation_notice";
  }

  if (trigger === "ticket-resend") {
    return "ticket_resend";
  }

  if (trigger === "show-reminder") {
    return "show_reminder";
  }

  if (trigger === "post-show-review") {
    return "post_show_review";
  }

  if (trigger === "waitlist-promotion") {
    return "waitlist_update";
  }

  return trigger === "custom-message" ? "custom_message" : "booking_update";
}

async function getEmailDeliveryStatus(
  record: CommunicationRecord,
  customerId: string | null,
  recipient?: string | null,
  deliveryStatus?: "failed" | "sent" | "suppressed",
  bookingReference?: string,
) {
  if (record.channel !== "email") {
    return deliveryStatus ?? ("sent" as const);
  }

  if (!customerId) {
    return "failed" as const;
  }

  let email: Parameters<typeof sendOperationalCustomerEmail>[0] = {
    customerId,
    kind: getOperationalCommunicationKind(record.trigger),
    message: record.message,
    subject: record.subject,
    to: recipient,
  };

  if (record.trigger === "ticket-resend" && bookingReference) {
    const ticketEmail = await loadAuthoritativeTicketEmail(bookingReference);
    email = {
      ...email,
      ...ticketEmail.email,
      to: ticketEmail.recipient,
    };
  }

  const result = await sendOperationalCustomerEmail(email);

  if (result.ok) {
    return "sent" as const;
  }

  console.error("[Zingara API] Email communication failed", {
    error: result.error,
    trigger: record.trigger,
  });

  return result.suppressed ? ("suppressed" as const) : ("failed" as const);
}

const bookingMetadataPrefix = "__zingara_booking_meta__:";

function parseBookingMetadata(notes: string | null) {
  if (!notes?.startsWith(bookingMetadataPrefix)) return null;

  try {
    return JSON.parse(notes.slice(bookingMetadataPrefix.length)) as DemoBooking;
  } catch {
    return null;
  }
}

async function loadAuthoritativeTicketEmail(bookingReference: string) {
  const supabase = getRouteClient();

  if (!supabase) throw new Error("Supabase client is not configured.");

  const { data: bookingRow, error: bookingError } = await supabase
    .from("bookings")
    .select(
      "id,customer_id,show_id,table_id,booking_reference,guest_count,section,notes,created_at,booking_status,total_amount",
    )
    .eq("booking_reference", bookingReference)
    .maybeSingle();

  if (bookingError) throw bookingError;
  if (!bookingRow) throw new Error("Authoritative booking could not be found.");

  const [customerResult, showResult, ticketResult, tableResult] =
    await Promise.all([
      supabase
        .from("customers")
        .select("first_name,surname,email,mobile")
        .eq("id", bookingRow.customer_id)
        .maybeSingle(),
      supabase
        .from("shows")
        .select("id,name,date,time,venue")
        .eq("id", bookingRow.show_id)
        .maybeSingle(),
      supabase
        .from("tickets")
        .select("ticket_code,qr_payload,ticket_status")
        .eq("booking_id", bookingRow.id)
        .order("issued_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
      bookingRow.table_id
        ? supabase
            .from("show_tables")
            .select("table_code,booking_id")
            .eq("id", bookingRow.table_id)
            .eq("booking_id", bookingRow.id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

  for (const result of [customerResult, showResult, ticketResult, tableResult]) {
    if (result.error) throw result.error;
  }

  const customer = customerResult.data;
  const showRow = showResult.data;
  const ticketRow = ticketResult.data;

  const metadata = parseBookingMetadata(bookingRow.notes);
  const ticketCode = ticketRow?.ticket_code ?? metadata?.ticketCode;
  const qrPayload = ticketRow?.qr_payload ?? ticketCode;

  if (!customer?.email) throw new Error("Ticket recipient email is missing.");
  if (!ticketCode || !qrPayload) {
    throw new Error("Authoritative ticket identity is missing.");
  }
  const customerName = [customer.first_name, customer.surname]
    .filter(Boolean)
    .join(" ")
    .trim();
  const booking: DemoBooking = {
    ...(metadata ?? {
      bookingDate: showRow?.date ?? "",
      communicationHistory: [],
      createdAt: bookingRow.created_at,
      customer: { email: customer.email, name: customerName, phone: customer.mobile ?? "" },
      partySize: bookingRow.guest_count,
      pricePerPerson: 0,
      reference: bookingRow.booking_reference,
      status: "confirmed",
      tableId: "",
      tableNumber: "",
      totalPrice: Number(bookingRow.total_amount) || 0,
      zoneId: "middle-ring",
      zoneTitle: bookingRow.section ?? "Middle Ring",
    }),
    customer: {
      email: customer.email,
      name: customerName || metadata?.customer.name || "Guest",
      phone: customer.mobile ?? metadata?.customer.phone ?? "",
    },
    partySize: bookingRow.guest_count,
    reference: bookingRow.booking_reference,
    showId: bookingRow.show_id,
    tableId: bookingRow.table_id ?? "",
    tableNumber: tableResult.data?.table_code ?? metadata?.tableNumber ?? "",
    ticketCode,
    zoneTitle: getDisplayZoneTitle(metadata?.zoneId, bookingRow.section ?? metadata?.zoneTitle),
  };
  const ticket = getGuestTicketsForBooking(booking).find(
    (candidate) => candidate.ticketCode === ticketCode,
  );
  const show = showRow
    ? {
        date: showRow.date,
        id: showRow.id,
        label: showRow.name,
        location: normalizeShowLocation(showRow.venue) ?? undefined,
        time: showRow.time.slice(0, 5),
        venueName: showRow.venue,
      }
    : null;

  return {
    email: await createZingaraTicketEmail({
      booking,
      qrPayload,
      show,
      ticket,
    }),
    recipient: customer.email,
  };
}

async function requireCommunicationManager(request: Request) {
  const auth = await requireActiveStaff(request);

  if (auth.error || !auth.staffProfile || !auth.user) {
    return {
      auth: null,
      error: auth.error ??
        Response.json(
          { error: "Active staff authentication is required." },
          { status: 401 },
        ),
    };
  }

  const role = Array.isArray(auth.staffProfile.roles)
    ? auth.staffProfile.roles[0]
    : auth.staffProfile.roles;

  if (!getRolePermissions(role).includes("communications:manage")) {
    return {
      auth: null,
      error: Response.json(
        { error: "Communication management access is required." },
        { status: 403 },
      ),
    };
  }

  return { auth, error: null };
}

async function getCommunicationPayload(
  record: CommunicationRecord,
  context: {
    booking?: DemoBooking;
    corporateRequest?: CorporateRequest;
  },
) {
  const supabase = getRouteClient();

  if (!supabase) {
    throw new Error("Supabase client is not configured.");
  }

  if (context.booking) {
    const { data: bookingRows, error } = await supabase
      .from("bookings")
      .select("id,customer_id,show_id")
      .eq("booking_reference", context.booking.reference)
      .limit(1);

    if (error) {
      throw error;
    }

    const bookingRelation = bookingRows?.[0] as
      | { customer_id: string; id: string; show_id: string }
      | undefined;

    return {
      booking_id: bookingRelation?.id ?? null,
      channel: toSupabaseChannel(record.channel),
      customer_id: bookingRelation?.customer_id ?? null,
      message: record.message,
      sent_at: record.sentAt,
      show_id: bookingRelation?.show_id ?? null,
      status: "sent" as const,
      subject: record.subject ?? null,
      type: toSupabaseType(record.trigger),
    };
  }

  let customerId: string | null = null;

  if (context.corporateRequest) {
    const email = context.corporateRequest.email?.trim().toLowerCase();
    const mobile = context.corporateRequest.contactNumber?.trim();
    const customerName = context.corporateRequest.contactName?.trim();
    const [firstName = customerName || email || "Corporate", ...surnameParts] =
      (customerName || email || "Corporate").split(/\s+/);
    const { data: existingRows, error: loadError } = await supabase
      .from("customers")
      .select("id,email,mobile")
      .or(
        [
          email ? `email.eq.${email}` : "",
          mobile ? `mobile.eq.${mobile}` : "",
        ]
          .filter(Boolean)
          .join(","),
      )
      .limit(1);

    if (loadError) {
      throw loadError;
    }

    customerId = (existingRows?.[0] as { id?: string } | undefined)?.id ?? null;

    if (!customerId) {
      const { data, error } = await supabase
        .from("customers")
        .insert({
          dietary_requirements:
            context.corporateRequest.dietaryRequirements.join(", ") || null,
          email: email || null,
          first_name: firstName,
          mobile: mobile || null,
          preferences: {
            customerKey: email || mobile || customerName?.toLowerCase(),
            vipTags: [],
          },
          relationship_notes: "",
          surname: surnameParts.join(" ") || null,
          vip_status: null,
        })
        .select("id")
        .maybeSingle();

      if (error) {
        throw error;
      }

      customerId = (data as { id?: string } | null)?.id ?? null;
    }
  }

  return {
    booking_id: null,
    channel: toSupabaseChannel(record.channel),
    customer_id: customerId,
    message: record.message,
    sent_at: record.sentAt,
    show_id: null,
    status: "sent" as const,
    subject: record.subject ?? null,
    type: toSupabaseType(record.trigger),
  };
}

function getCommunicationRecipient(
  record: CommunicationRecord,
  context: {
    booking?: DemoBooking;
    corporateRequest?: CorporateRequest;
  },
) {
  if (record.channel !== "email") {
    return null;
  }

  return context.booking?.customer.email ?? context.corporateRequest?.email ?? null;
}

export async function POST(request: Request) {
  const authorization = await requireCommunicationManager(request);

  if (!authorization.auth) {
    return authorization.error;
  }

  const supabase = getRouteClient();

  if (!supabase) {
    return Response.json(
      { error: "Supabase client is not configured." },
      { status: 500 },
    );
  }

  try {
    const body = (await request.json()) as {
      booking?: DemoBooking;
      corporateRequest?: CorporateRequest;
      deliveryStatus?: "failed" | "sent" | "suppressed";
      record?: CommunicationRecord;
    };

    if (!body.record) {
      return Response.json(
        { error: "Communication record is required." },
        { status: 400 },
      );
    }

    const context = {
      booking: body.booking,
      corporateRequest: body.corporateRequest,
    };
    const payload = await getCommunicationPayload(body.record, context);
    const duplicateRow = await findDuplicateSentCommunication(supabase, {
      ...payload,
      status: "sent",
    });

    if (duplicateRow) {
      return Response.json({ deduped: true, row: duplicateRow });
    }

    const status = await getEmailDeliveryStatus(
      body.record,
      payload.customer_id,
      getCommunicationRecipient(body.record, context),
      body.deliveryStatus,
      body.booking?.reference,
    );
    const data = await insertCommunicationPayload(supabase, {
      ...payload,
      status,
    });

    return Response.json({ row: data });
  } catch (error) {
    console.error("[Zingara API] Failed to save communication", error);

    return Response.json(
      { error: "Communication could not be saved." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const authorization = await requireCommunicationManager(request);

  if (!authorization.auth) {
    return authorization.error;
  }

  const supabase = getRouteClient();

  if (!supabase) {
    return Response.json(
      { error: "Supabase client is not configured." },
      { status: 500 },
    );
  }

  try {
    const body = (await request.json()) as {
      booking?: DemoBooking;
      corporateRequest?: CorporateRequest;
      record?: CommunicationRecord;
    };

    if (!body.record) {
      return Response.json(
        { error: "Communication record is required." },
        { status: 400 },
      );
    }

    const payload = await getCommunicationPayload(body.record, {
      booking: body.booking,
      corporateRequest: body.corporateRequest,
    });
    const { data, error } = await supabase
      .from("communications")
      .update(payload)
      .eq("id", body.record.id)
      .select(
        "id,customer_id,booking_id,show_id,batch_id,type,channel,subject,message,status,sent_at,created_at",
      )
      .maybeSingle();

    if (error) {
      throw error;
    }

    return Response.json({ row: data });
  } catch (error) {
    console.error("[Zingara API] Failed to update communication", error);

    return Response.json(
      { error: "Communication could not be updated." },
      { status: 500 },
    );
  }
}
