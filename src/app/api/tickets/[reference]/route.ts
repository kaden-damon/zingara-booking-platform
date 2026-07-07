import {
  type DemoBooking,
  type DemoShow,
  type DemoVenueSettings,
  type GuestTicket,
  createGuestTicketCode,
  defaultVenueSettings,
  getGuestTicketsForBooking,
  getTicketUrl,
  normalizeTicketReference,
  seatingZones,
} from "@/lib/zingaraDemo";
import { sendZingaraEmail } from "@/lib/email/smtp";
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
  guest_count: number;
  id: string;
  notes: string | null;
  section: string | null;
  show_id: string;
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

function getTicketQrPayload(ticketCode: string, requestUrl: string) {
  return new URL(getTicketUrlForCode(ticketCode), requestUrl).toString();
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
    seatingZones.find((item) => item.title === booking.zoneTitle);

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
      label: "Royal Booths Ruby",
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
      .select("id,booking_reference,booking_status,created_at,guest_count,notes,section,show_id")
      .eq("id", ticketRow.booking_id)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data as SupabaseBookingRow | null;
  }

  const { data, error } = await supabase
    .from("bookings")
    .select("id,booking_reference,booking_status,created_at,guest_count,notes,section,show_id")
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
      qr_payload: getTicketQrPayload(ticket.ticketCode, requestUrl),
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
    zoneTitle: bookingRow.section ?? "Middle Ring",
  } satisfies DemoBooking;
  const booking = await persistGuestTickets(
    requestUrl,
    bookingRow.id,
    metadataBooking ?? fallbackBooking,
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
      .select("id,date,time,name,notes")
      .eq("id", bookingRow.show_id)
      .maybeSingle(),
    supabase
      .from("venue_settings")
      .select("venue_key,name,settings")
      .limit(1)
      .maybeSingle(),
  ]);

  return {
    activeTicket,
    bookingId: bookingRow.id,
    booking: {
      ...booking,
      guestTickets,
    },
    show: showRow as (DemoShow & { name?: string }) | null,
    tableColour: getTableColour(booking),
    venueSettings: toVenueSettings(venueRow as SupabaseVenueSettingsRow | null),
  };
}

export async function GET(request: Request, context: TicketRouteContext) {
  try {
    const { reference } = await context.params;
    const payload = await loadTicketPayload(reference, request.url);

    if (!payload) {
      return Response.json({ error: "Ticket not found." }, { status: 404 });
    }

    return Response.json(payload);
  } catch (error) {
    console.error("[Zingara API] Failed to load live ticket", error);

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

    return Response.json(await loadTicketPayload(ticketCode, request.url));
  } catch (error) {
    console.error("[Zingara API] Failed to update live ticket", error);

    return Response.json(
      { error: "Ticket could not be updated." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, context: TicketRouteContext) {
  try {
    const { reference } = await context.params;
    const body = (await request.json()) as {
      action?: "email" | "regenerate" | "resend";
      ticketCode?: string;
    };
    const payload = await loadTicketPayload(
      body.ticketCode ?? reference,
      request.url,
    );

    if (!payload) {
      return Response.json({ error: "Ticket not found." }, { status: 404 });
    }

    if (body.action === "regenerate") {
      const supabase = getServiceClient();
      const currentTicket = payload.activeTicket;

      if (!supabase || currentTicket.status === "checked-in") {
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

      return Response.json(await loadTicketPayload(regeneratedTicketCode, request.url));
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
      const result = await sendZingaraEmail({
        message: `Your Zingara ticket is ready.\n\nOpen your ticket: ${ticketUrl}`,
        subject: "Your Zingara Ticket",
        to: email,
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
