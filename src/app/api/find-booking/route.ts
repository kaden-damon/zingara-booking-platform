import {
  type DemoBooking,
  type GuestTicket,
  defaultVenueSettings,
  getGuestTicketsForBooking,
} from "@/lib/zingaraDemo";
import { getServiceClient } from "@/lib/supabase/serverAdmin";

export const dynamic = "force-dynamic";

const bookingMetadataPrefix = "__zingara_booking_meta__:";
const genericNotFoundMessage =
  "We couldn't locate a booking matching those details.";

type FindBookingRequest = {
  bookingReference?: string;
  emailAddress?: string;
  location?: "cape-town" | "johannesburg";
  mobileNumber?: string;
  verificationType?: "email" | "mobile";
};

type SupabaseBookingRow = {
  balance_outstanding: number;
  booking_reference: string;
  booking_status: string;
  created_at: string;
  customer_id: string | null;
  guest_count: number;
  id: string;
  notes: string | null;
  payment_status: string;
  section: string | null;
  show_id: string | null;
  table_id: string | null;
  total_amount: number;
};

type SupabaseCustomerRow = {
  email: string | null;
  first_name: string | null;
  mobile: string | null;
  surname: string | null;
};

type SupabaseShowRow = {
  date: string;
  id: string;
  name: string | null;
  notes?: string | null;
  time: string;
  venue?: string | null;
};

type SupabaseTicketRow = {
  ticket_code: string;
  ticket_status: string;
};

function normalizeEmail(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function normalizePhone(value: string | null | undefined) {
  return value?.replace(/\D/g, "") ?? "";
}

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

function toDisplayStatus(value: string | undefined) {
  return (value ?? "")
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeEntryLocation(value: string | null | undefined) {
  const normalisedValue = value?.trim().toLowerCase();

  if (
    normalisedValue === "johannesburg" ||
    normalisedValue === "joburg"
  ) {
    return "johannesburg";
  }

  if (normalisedValue === "cape-town" || normalisedValue === "cape town") {
    return "cape-town";
  }

  return null;
}

function getShowLocation(show: SupabaseShowRow | null) {
  const source = [
    show?.name,
    show?.venue,
    show?.notes,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return source.includes("joburg") || source.includes("johannesburg")
    ? "johannesburg"
    : "cape-town";
}

function getLocationLabel(location: string) {
  return location === "johannesburg" ? "Johannesburg" : defaultVenueSettings.venueName;
}

function getCustomerName(
  booking: DemoBooking | undefined,
  customer: SupabaseCustomerRow | null,
) {
  const customerName = booking?.customer.name?.trim();

  if (customerName) {
    return customerName;
  }

  return [customer?.first_name, customer?.surname].filter(Boolean).join(" ") || "Guest";
}

function getCustomerEmail(
  booking: DemoBooking | undefined,
  customer: SupabaseCustomerRow | null,
) {
  return booking?.customer.email?.trim() || customer?.email || "";
}

function getCustomerPhone(
  booking: DemoBooking | undefined,
  customer: SupabaseCustomerRow | null,
) {
  return booking?.customer.phone?.trim() || customer?.mobile || "";
}

function toTicketStatus(ticket: GuestTicket, row: SupabaseTicketRow | undefined) {
  if (row?.ticket_status === "checked_in") {
    return "checked-in";
  }

  if (row?.ticket_status === "void") {
    return "void";
  }

  return ticket.status;
}

function getVerifiedTickets(
  booking: DemoBooking | undefined,
  ticketRows: SupabaseTicketRow[],
) {
  if (!booking) {
    return ticketRows.map((ticketRow, index) => ({
      email: "",
      fullName: `Guest ${index + 1}`,
      index: index + 1,
      mobile: "",
      status:
        ticketRow.ticket_status === "checked_in"
          ? "checked-in"
          : ticketRow.ticket_status === "void"
            ? "void"
            : "valid",
      ticketCode: ticketRow.ticket_code,
      total: ticketRows.length,
    }));
  }

  return getGuestTicketsForBooking(booking).map((ticket) => {
    const row = ticketRows.find(
      (ticketRow) => ticketRow.ticket_code === ticket.ticketCode,
    );

    return {
      ...ticket,
      status: toTicketStatus(ticket, row),
    };
  });
}

function isVerified(
  body: FindBookingRequest,
  booking: DemoBooking | undefined,
  customer: SupabaseCustomerRow | null,
) {
  if (body.verificationType === "email") {
    return (
      normalizeEmail(body.emailAddress) !== "" &&
      normalizeEmail(body.emailAddress) ===
        normalizeEmail(getCustomerEmail(booking, customer))
    );
  }

  if (body.verificationType === "mobile") {
    return (
      normalizePhone(body.mobileNumber) !== "" &&
      normalizePhone(body.mobileNumber) ===
        normalizePhone(getCustomerPhone(booking, customer))
    );
  }

  return false;
}

export async function POST(request: Request) {
  const supabase = getServiceClient();

  if (!supabase) {
    return Response.json(
      { error: "Booking lookup is temporarily unavailable." },
      { status: 500 },
    );
  }

  try {
    const body = (await request.json()) as FindBookingRequest;
    const bookingReference = body.bookingReference?.trim().toUpperCase();

    if (!bookingReference) {
      return Response.json(
        { error: genericNotFoundMessage },
        { status: 404 },
      );
    }

    const { data: bookingRow, error: bookingError } = await supabase
      .from("bookings")
      .select(
        "id,customer_id,show_id,table_id,booking_reference,guest_count,booking_status,payment_status,section,total_amount,balance_outstanding,notes,created_at",
      )
      .eq("booking_reference", bookingReference)
      .maybeSingle();

    if (bookingError) {
      throw bookingError;
    }

    if (!bookingRow) {
      return Response.json(
        { error: genericNotFoundMessage },
        { status: 404 },
      );
    }

    const booking = bookingRow as SupabaseBookingRow;
    const [{ data: customer }, { data: show }, { data: ticketRows }] =
      await Promise.all([
        booking.customer_id
          ? supabase
              .from("customers")
              .select("first_name,surname,email,mobile")
              .eq("id", booking.customer_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        booking.show_id
          ? supabase
              .from("shows")
              .select("id,name,date,time,notes,venue")
              .eq("id", booking.show_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        supabase
          .from("tickets")
          .select("ticket_code,ticket_status")
          .eq("booking_id", booking.id)
          .order("ticket_code", { ascending: true }),
      ]);
    const metadataBooking = parseBookingNotes(booking.notes);
    const customerRow = customer as SupabaseCustomerRow | null;

    if (!isVerified(body, metadataBooking, customerRow)) {
      return Response.json(
        { error: genericNotFoundMessage },
        { status: 404 },
      );
    }

    const showRow = show as SupabaseShowRow | null;
    const preferredLocation = normalizeEntryLocation(body.location);
    const bookingLocation = getShowLocation(showRow);

    if (preferredLocation && bookingLocation !== preferredLocation) {
      return Response.json(
        { error: genericNotFoundMessage },
        { status: 404 },
      );
    }

    const tickets = getVerifiedTickets(
      metadataBooking,
      (ticketRows ?? []) as SupabaseTicketRow[],
    );
    const ticketStatus =
      tickets.length === 0
        ? "Not Issued"
        : tickets.every((ticket) => ticket.status === "checked-in")
          ? "Checked In"
          : tickets.some((ticket) => ticket.status === "void")
            ? "Reissued"
            : "Issued";
    const venueName = getLocationLabel(bookingLocation);
    const customerName = getCustomerName(metadataBooking, customerRow);
    const customerEmail = getCustomerEmail(metadataBooking, customerRow);
    const customerPhone = getCustomerPhone(metadataBooking, customerRow);

    return Response.json({
      booking: {
        balanceDue:
          metadataBooking?.balanceDue ?? Number(booking.balance_outstanding ?? 0),
        bookingReference: booking.booking_reference,
        bookingStatus:
          metadataBooking?.status ?? booking.booking_status.replaceAll("_", "-"),
        customer: {
          email: customerEmail,
          name: customerName,
          phone: customerPhone,
        },
        date: showRow?.date ?? "",
        partySize: metadataBooking?.partySize ?? booking.guest_count,
        paymentStatus:
          metadataBooking?.paymentStatus ??
          booking.payment_status.replaceAll("_", "-"),
        paymentStatusLabel: toDisplayStatus(
          metadataBooking?.paymentStatus ?? booking.payment_status,
        ),
        seatingZone: metadataBooking?.zoneTitle ?? booking.section ?? "Seating",
        show: showRow?.name ?? "The Royal Countess Zingara",
        table: metadataBooking?.tableNumber ?? "Internal",
        ticketStatus,
        time: showRow?.time?.slice(0, 5) ?? "",
        totalAmount: metadataBooking?.totalPrice ?? Number(booking.total_amount ?? 0),
        venue: venueName,
      },
      tickets,
    });
  } catch (error) {
    console.error("[Zingara API] Failed to find booking", error);

    return Response.json(
      { error: "Booking lookup is temporarily unavailable." },
      { status: 500 },
    );
  }
}
