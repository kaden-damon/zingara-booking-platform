import {
  type DemoBooking,
  type DemoShow,
  type DemoVenueSettings,
  type GuestTicket,
  createGuestTicketCode,
  defaultVenueSettings,
  getDisplayZoneTitle,
  getZoneSectionLookupTitles,
  getGuestTicketsForBooking,
  getTicketUrl,
  normalizeShowLocation,
  normalizeTicketReference,
  seatingZones,
} from "@/lib/zingaraDemo";
import {
  findDuplicateSentCommunication,
  insertCommunicationPayload,
} from "@/lib/email/communicationIdempotency";
import { resolveGuestVisibleTable } from "@/lib/guestTicketDisplay";
import { sendZingaraEmail } from "@/lib/email/smtp";
import {
  checkRateLimit,
  rateLimitResponse,
} from "@/lib/rateLimit";
import {
  recordPlatformFailureEventBestEffort,
  recoverPlatformIncidentBestEffort,
} from "@/lib/platformTelemetry";
import { getServiceClient } from "@/lib/supabase/serverAdmin";

export const dynamic = "force-dynamic";

const bookingMetadataPrefix = "__zingara_booking_meta__:";

type TicketRouteContext = {
  params: Promise<{
    reference: string;
  }>;
};

type SupabaseBookingRow = {
  booking_reference: string;
  booking_status: string;
  created_at: string;
  customer_id: string;
  guest_count: number;
  id: string;
  notes: string | null;
  section: string | null;
  show_id: string;
  table_id: string | null;
};

type SupabaseTicketRow = {
  booking_id: string;
  id: string;
  issued_at: string | null;
  qr_payload: string | null;
  ticket_code: string;
  ticket_status: "cancelled" | "checked_in" | "expired" | "issued" | "refunded" | "valid" | "void";
  ticket_url: string | null;
  updated_at?: string;
};

type SupabaseVenueSettingsRow = {
  name: string;
  settings: DemoVenueSettings | null;
  venue_key: string;
};

function parseBookingNotes(notes: string | null) {
  if (!notes?.startsWith(bookingMetadataPrefix)) {
    return undefined;
  }

  try {
    return JSON.parse(notes.slice(bookingMetadataPrefix.length)) as DemoBooking;
  } catch {
    return undefined;
  }
}

function serializeBookingNotes(booking: DemoBooking) {
  return `${bookingMetadataPrefix}${JSON.stringify(booking)}`;
}

function toTicketStatus(ticketStatus?: SupabaseTicketRow["ticket_status"]) {
  return ticketStatus === "checked_in" ? "checked-in" : "valid";
}

function getTicketUrlForCode(ticketCode: string) {
  return getTicketUrl(ticketCode);
}

function getTicketQrPayload(ticketCode: string) {
  return ticketCode;
}

type TicketPayload = NonNullable<Awaited<ReturnType<typeof loadTicketPayload>>>;

function getGuestFacingTicketPayload(payload: TicketPayload) {
  const tableNumber = resolveGuestVisibleTable(
    payload.booking,
    payload.activeTicket,
  );

  return {
    ...payload,
    booking: {
      ...payload.booking,
      tableId: "",
      tableNumber,
    },
  };
}

function toVenueSettings(row: SupabaseVenueSettingsRow | null | undefined) {
  return {
    ...defaultVenueSettings,
    ...(row?.settings ?? {}),
    venueId:
      row?.venue_key ??
      row?.settings?.venueId ??
      defaultVenueSettings.venueId,
    venueName:
      row?.name ??
      row?.settings?.venueName ??
      defaultVenueSettings.venueName,
  };
}

function getTableColour(booking: DemoBooking) {
  const zone =
    seatingZones.find((item) => item.id === booking.zoneId) ??
    seatingZones.find((item) => {
      const normalizedBookingZoneTitle = booking.zoneTitle.trim().toLowerCase();

      return getZoneSectionLookupTitles(item.id, item.title)
        .map((title) => title.toLowerCase())
        .includes(normalizedBookingZoneTitle);
    });

  if (!zone) {
    return {
      background: "#111111",
      border: "#D8C36A",
      label: "Zingara Gold",
    };
  }

  const colourMap: Record<string, { background: string; border: string; label: string }> = {
    "elevated-stage": {
      background: "#4D4213",
      border: "#8D7A2F",
      label: "Elevated Stage Gold",
    },
    "golden-circle": {
      background: "#4A0D2B",
      border: "#8F4B68",
      label: "Golden Circle Plum",
    },
    "middle-ring": {
      background: "#0F5C4D",
      border: "#3A9D8B",
      label: "Middle Ring Emerald",
    },
    "royal-balcony": {
      background: "#3B1B52",
      border: "#8C62A8",
      label: "Royal Balcony Violet",
    },
    "royal-booths": {
      background: "#5B001B",
      border: "#A34063",
      label: "Private Booths Ruby",
    },
  };

  return (
    colourMap[zone.id] ?? {
      background: "#111111",
      border: "#D8C36A",
      label: zone.title,
    }
  );
}

function ensureBookingGuestTickets(
  booking: DemoBooking,
  ticketRows: SupabaseTicketRow[],
) {
  const guestTickets = getGuestTicketsForBooking(booking).map((ticket) => {
    const row = ticketRows.find(
      (currentRow) => currentRow.ticket_code === ticket.ticketCode,
    );

    return {
      ...ticket,
      status: row ? toTicketStatus(row.ticket_status) : ticket.status,
    } satisfies GuestTicket;
  });

  return {
    ...booking,
    guestTickets,
  };
}

async function loadBookingByReferenceOrTicket(
  reference: string,
  ticketRow: SupabaseTicketRow | undefined,
) {
  const supabase = getServiceClient();

  if (!supabase) {
    throw new Error("Supabase service role is not configured.");
  }

  if (ticketRow?.booking_id) {
    const { data, error } = await supabase
      .from("bookings")
      .select("id,customer_id,booking_reference,booking_status,created_at,guest_count,notes,section,show_id,table_id")
      .eq("id", ticketRow.booking_id)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data as SupabaseBookingRow | null;
  }

  const { data, error } = await supabase
    .from("bookings")
    .select("id,customer_id,booking_reference,booking_status,created_at,guest_count,notes,section,show_id,table_id")
    .eq("booking_reference", reference)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as SupabaseBookingRow | null;
}

async function loadTicketRow(reference: string) {
  const supabase = getServiceClient();

  if (!supabase) {
    throw new Error("Supabase service role is not configured.");
  }

  const { data, error } = await supabase
    .from("tickets")
    .select("id,booking_id,ticket_code,ticket_url,qr_payload,ticket_status,issued_at,updated_at")
    .eq("ticket_code", reference)
    .limit(1);

  if (error) {
    throw error;
  }

  return (data?.[0] as SupabaseTicketRow | undefined) ?? undefined;
}

async function loadTicketRowsForBooking(bookingId: string) {
  const supabase = getServiceClient();

  if (!supabase) {
    throw new Error("Supabase service role is not configured.");
  }

  const { data, error } = await supabase
    .from("tickets")
    .select("id,booking_id,ticket_code,ticket_url,qr_payload,ticket_status,issued_at,updated_at")
    .eq("booking_id", bookingId)
    .order("ticket_code", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as SupabaseTicketRow[];
}

async function persistGuestTickets(
  requestUrl: string,
  bookingId: string,
  booking: DemoBooking,
) {
  const supabase = getServiceClient();

  if (!supabase) {
    throw new Error("Supabase service role is not configured.");
  }

  const ticketRows = await loadTicketRowsForBooking(bookingId);
  const nextBooking = ensureBookingGuestTickets(booking, ticketRows);
  const issuedAt = booking.ticketIssuedAt ?? new Date().toISOString();

  for (const ticket of nextBooking.guestTickets ?? []) {
    const payload = {
      booking_id: bookingId,
      issued_at: issuedAt,
      qr_payload: getTicketQrPayload(ticket.ticketCode),
      ticket_code: ticket.ticketCode,
      ticket_status: ticket.status === "checked-in" ? "checked_in" : "valid",
      ticket_url: getTicketUrlForCode(ticket.ticketCode),
    };
    const existingRow = ticketRows.find(
      (row) => row.ticket_code === ticket.ticketCode,
    );

    if (existingRow) {
      await supabase.from("tickets").update(payload).eq("id", existingRow.id);
    } else {
      await supabase.from("tickets").insert(payload);
    }
  }

  await supabase
    .from("bookings")
    .update({ notes: serializeBookingNotes(nextBooking) })
    .eq("id", bookingId);

  return nextBooking;
}

async function loadTicketPayload(reference: string, requestUrl: string) {
  const supabase = getServiceClient();

  if (!supabase) {
    throw new Error("Supabase service role is not configured.");
  }

  const normalizedReference = normalizeTicketReference(reference);
  const ticketRow = await loadTicketRow(normalizedReference);
  const bookingRow = await loadBookingByReferenceOrTicket(
    normalizedReference,
    ticketRow,
  );

  if (!bookingRow) {
    return null;
  }

  const metadataBooking = parseBookingNotes(bookingRow.notes);
  const { data: tableRow, error: tableError } = bookingRow.table_id
    ? await supabase
        .from("show_tables")
        .select("table_code,booking_id")
        .eq("id", bookingRow.table_id)
        .eq("booking_id", bookingRow.id)
        .maybeSingle()
    : { data: null, error: null };

  if (tableError) {
    throw tableError;
  }

  const authoritativeZone = seatingZones.find((zone) =>
    getZoneSectionLookupTitles(zone.id, zone.title)
      .map((title) => title.toLowerCase())
      .includes(bookingRow.section?.trim().toLowerCase() ?? ""),
  );
  const fallbackBooking = {
    bookingDate: "",
    communicationHistory: [],
    createdAt: bookingRow.created_at,
    customer: {
      email: "",
      name: "Guest",
      phone: "",
    },
    partySize: bookingRow.guest_count,
    pricePerPerson: 0,
    reference: bookingRow.booking_reference,
    showId: bookingRow.show_id,
    status:
      bookingRow.booking_status === "checked_in"
        ? "checked-in"
        : bookingRow.booking_status === "cancelled"
          ? "cancelled"
          : "confirmed",
    tableId: "",
    tableNumber: "Internal",
    totalPrice: 0,
    zoneId: "middle-ring",
    zoneTitle: getDisplayZoneTitle(undefined, bookingRow.section ?? "Middle Ring"),
  } satisfies DemoBooking;
  const booking = await persistGuestTickets(
    requestUrl,
    bookingRow.id,
    {
      ...(metadataBooking ?? fallbackBooking),
      tableId: bookingRow.table_id ?? "",
      tableNumber:
        (tableRow as { table_code?: string } | null)?.table_code ??
        metadataBooking?.tableNumber ??
        fallbackBooking.tableNumber,
      zoneId:
        authoritativeZone?.id ??
        metadataBooking?.zoneId ??
        fallbackBooking.zoneId,
      zoneTitle:
        authoritativeZone?.title ??
        getDisplayZoneTitle(
          metadataBooking?.zoneId,
          bookingRow.section ?? metadataBooking?.zoneTitle ?? "Middle Ring",
        ),
    },
  );
  const ticketRows = await loadTicketRowsForBooking(bookingRow.id);
  const guestTickets = getGuestTicketsForBooking(booking).map((ticket) => {
    const row = ticketRows.find(
      (currentRow) => currentRow.ticket_code === ticket.ticketCode,
    );

    return {
      ...ticket,
      status: row ? toTicketStatus(row.ticket_status) : ticket.status,
    } satisfies GuestTicket;
  });
  const activeTicket =
    guestTickets.find((ticket) => ticket.ticketCode === normalizedReference) ??
    guestTickets[0];
  const [{ data: showRow }, { data: venueRow }] = await Promise.all([
    supabase
      .from("shows")
      .select("id,date,time,name,notes,venue")
      .eq("id", bookingRow.show_id)
      .maybeSingle(),
    supabase
      .from("venue_settings")
      .select("venue_key,name,settings")
      .limit(1)
      .maybeSingle(),
  ]);

  const show = showRow as (DemoShow & { name?: string; venue?: string | null }) | null;
  const showLocation = normalizeShowLocation(
    show?.location ?? show?.venue ?? show?.venueName,
  );

  return {
    activeTicket,
    bookingId: bookingRow.id,
    booking: {
      ...booking,
      guestTickets,
    },
    show: show
      ? {
          ...show,
          location: showLocation ?? show.location,
        }
      : null,
    tableColour: getTableColour(booking),
    venueSettings: toVenueSettings(venueRow as SupabaseVenueSettingsRow | null),
  };
}

export async function GET(request: Request, context: TicketRouteContext) {
  const supabase = getServiceClient();

  try {
    const { reference } = await context.params;
    const lookupLimit = await checkRateLimit(
      request,
      {
        limit: 120,
        scope: "ticket_lookup_ip",
        windowSeconds: 60,
      },
      [],
      supabase,
    );

    if (!lookupLimit.allowed) {
      return rateLimitResponse(
        lookupLimit.retryAfterSeconds,
        {
          operation: "load_live_ticket",
          route: "/api/tickets/[reference]",
          safeFingerprint: "ticket_lookup_rate_limited_ip",
        },
        supabase,
      );
    }

    const referenceLimit = await checkRateLimit(
      request,
      {
        limit: 20,
        scope: "ticket_lookup_reference",
        windowSeconds: 300,
      },
      [reference],
      supabase,
    );

    if (!referenceLimit.allowed) {
      return rateLimitResponse(
        referenceLimit.retryAfterSeconds,
        {
          operation: "load_live_ticket",
          route: "/api/tickets/[reference]",
          safeFingerprint: "ticket_lookup_rate_limited_reference",
        },
        supabase,
      );
    }

    const payload = await loadTicketPayload(reference, request.url);

    if (!payload) {
      return Response.json({ error: "Ticket not found." }, { status: 404 });
    }

    recoverPlatformIncidentBestEffort(
      {
        fingerprint: "ticket_lookup_unavailable",
        service: "BOOKING API",
        summary: "Live ticket lookup recovered.",
      },
      supabase,
    );

    return Response.json(getGuestFacingTicketPayload(payload));
  } catch (error) {
    console.error("[Zingara API] Failed to load live ticket", error);
    recordPlatformFailureEventBestEffort(
      {
        operation: "load_live_ticket",
        route: "/api/tickets/[reference]",
        safeFingerprint: "ticket_lookup_unavailable",
        service: "BOOKING API",
        statusCode: 500,
        summary: "Live ticket lookup failures are recurring.",
      },
      supabase,
    );

    return Response.json(
      { error: "Ticket could not be loaded." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request, context: TicketRouteContext) {
  const supabase = getServiceClient();

  if (!supabase) {
    return Response.json(
      { error: "Supabase service role is not configured." },
      { status: 500 },
    );
  }

  try {
    const { reference } = await context.params;
    const body = (await request.json()) as {
      email?: string;
      fullName?: string;
      mobile?: string;
      ticketCode?: string;
    };
    const actionLimit = await checkRateLimit(
      request,
      {
        limit: 12,
        scope: "ticket_update_reference",
        windowSeconds: 300,
      },
      [reference, body.ticketCode],
      supabase,
    );

    if (!actionLimit.allowed) {
      return rateLimitResponse(
        actionLimit.retryAfterSeconds,
        {
          operation: "update_live_ticket",
          route: "/api/tickets/[reference]",
          safeFingerprint: "ticket_update_rate_limited_reference",
        },
        supabase,
      );
    }

    const payload = await loadTicketPayload(reference, request.url);

    if (!payload) {
      return Response.json({ error: "Ticket not found." }, { status: 404 });
    }

    const ticketCode = body.ticketCode ?? payload.activeTicket.ticketCode;
    const currentTicket = payload.booking.guestTickets?.find(
      (ticket) => ticket.ticketCode === ticketCode,
    );

    if (!currentTicket || currentTicket.status === "checked-in") {
      return Response.json(
        { error: "This ticket can no longer be edited." },
        { status: 409 },
      );
    }

    const nextBooking = {
      ...payload.booking,
      guestTickets: (payload.booking.guestTickets ?? []).map((ticket) =>
        ticket.ticketCode === ticketCode
          ? {
              ...ticket,
              email: body.email ?? ticket.email,
              fullName: body.fullName ?? ticket.fullName,
              mobile: body.mobile ?? ticket.mobile,
            }
          : ticket,
      ),
    };

    await supabase
      .from("bookings")
      .update({ notes: serializeBookingNotes(nextBooking) })
      .eq("booking_reference", payload.booking.reference);

    const nextPayload = await loadTicketPayload(ticketCode, request.url);

    return nextPayload
      ? Response.json(getGuestFacingTicketPayload(nextPayload))
      : Response.json({ error: "Ticket not found." }, { status: 404 });
  } catch (error) {
    console.error("[Zingara API] Failed to update live ticket", error);

    return Response.json(
      { error: "Ticket could not be updated." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, context: TicketRouteContext) {
  const supabase = getServiceClient();

  if (!supabase) {
    return Response.json(
      { error: "Supabase service role is not configured." },
      { status: 500 },
    );
  }

  try {
    const { reference } = await context.params;
    const body = (await request.json()) as {
      action?: "email" | "regenerate" | "resend";
      ticketCode?: string;
    };
    const actionLimit = await checkRateLimit(
      request,
      {
        limit: 10,
        scope: "ticket_action_reference",
        windowSeconds: 300,
      },
      [reference, body.ticketCode, body.action],
      supabase,
    );

    if (!actionLimit.allowed) {
      return rateLimitResponse(
        actionLimit.retryAfterSeconds,
        {
          operation: "ticket_action",
          route: "/api/tickets/[reference]",
          safeFingerprint: "ticket_action_rate_limited_reference",
        },
        supabase,
      );
    }

    const payload = await loadTicketPayload(
      body.ticketCode ?? reference,
      request.url,
    );

    if (!payload) {
      return Response.json({ error: "Ticket not found." }, { status: 404 });
    }

    if (body.action === "regenerate") {
      const currentTicket = payload.activeTicket;

      if (currentTicket.status === "checked-in") {
        return Response.json(
          { error: "This ticket can no longer be regenerated." },
          { status: 409 },
        );
      }

      const regeneratedTicketCode = createGuestTicketCode(
        payload.booking.reference,
        currentTicket.index,
      ).replace(/$/, `R${Date.now().toString(36).toUpperCase()}`);
      const nextBooking = {
        ...payload.booking,
        guestTickets: (payload.booking.guestTickets ?? []).map((ticket) =>
          ticket.ticketCode === currentTicket.ticketCode
            ? {
                ...ticket,
                regeneratedAt: new Date().toISOString(),
                ticketCode: regeneratedTicketCode,
              }
            : ticket,
        ),
      };

      await supabase
        .from("tickets")
        .update({ ticket_status: "void" })
        .eq("ticket_code", currentTicket.ticketCode);
      await supabase
        .from("bookings")
        .update({ notes: serializeBookingNotes(nextBooking) })
        .eq("booking_reference", payload.booking.reference);
      await persistGuestTickets(request.url, payload.bookingId, nextBooking);

      const nextPayload = await loadTicketPayload(
        regeneratedTicketCode,
        request.url,
      );

      return nextPayload
        ? Response.json(getGuestFacingTicketPayload(nextPayload))
        : Response.json({ error: "Ticket not found." }, { status: 404 });
    }

    if (body.action === "email" || body.action === "resend") {
      const email = payload.activeTicket.email?.trim();

      if (!email) {
        return Response.json(
          { error: "This ticket does not have an email address." },
          { status: 400 },
        );
      }

      const ticketUrl = new URL(
        getTicketUrlForCode(payload.activeTicket.ticketCode),
        request.url,
      ).toString();
      const message =
        body.action === "resend"
          ? `Your Zingara ticket has been resent.\n\nOpen your ticket: ${ticketUrl}`
          : `Your Zingara ticket is ready.\n\nOpen your ticket: ${ticketUrl}`;
      const subject =
        body.action === "resend"
          ? "Your Zingara Ticket Resend"
          : "Your Zingara Ticket";
      const baseCommunicationPayload = {
        booking_id: payload.bookingId,
        channel: "email",
        customer_id: null,
        message,
        sent_at: new Date().toISOString(),
        show_id: null,
        status: "sent" as const,
        subject,
        type: "custom_message",
      };
      const duplicateRow = await findDuplicateSentCommunication(
        supabase,
        baseCommunicationPayload,
        {
          replayWindowMs: body.action === "resend" ? 60_000 : undefined,
        },
      );

      if (duplicateRow) {
        return Response.json({
          deduped: true,
          ok: true,
          status: "sent",
        });
      }

      const result = await sendZingaraEmail({
        message,
        subject,
        to: email,
      });
      await insertCommunicationPayload(supabase, {
        ...baseCommunicationPayload,
        status: result.ok ? "sent" : "failed",
      });

      return Response.json({
        ok: result.ok,
        status: result.ok ? "sent" : "failed",
      });
    }

    return Response.json({ error: "Unknown ticket action." }, { status: 400 });
  } catch (error) {
    console.error("[Zingara API] Failed to process live ticket action", error);

    return Response.json(
      { error: "Ticket action could not be completed." },
      { status: 500 },
    );
  }
}
