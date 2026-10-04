import { isAuthoritativeCorporateBooking } from "@/lib/bookingClassification";
import { normalizeBookingZone } from "@/lib/bookingManagementServer";
import { normalizeStaffVenueScope } from "@/lib/staffLocations";
import {
  getAllTicketsZipFilename,
  resolveDownloadableTicketPopulation,
  type PersistedTicketIdentity,
} from "@/lib/ticketBulkDownload";
import { createAllTicketsZip } from "@/lib/ticketBulkZipServer";
import {
  resolveDownloadableTicketPdfInput,
  type DownloadableTicketPdfSource,
} from "@/lib/ticketPdf";
import {
  resolveTicketTableColour,
  resolveTicketVenueSettings,
  type TicketVenueSettingsRow,
} from "@/lib/ticketPresentation";
import { resolveOptionalServerSecretPassword } from "@/lib/secretPassword";
import {
  getRolePermissions,
  requireActiveStaff,
} from "@/lib/supabase/serverAdmin";
import {
  getDisplayZoneTitle,
  normalizeShowLocation,
  normalizeTicketReference,
  type DemoBooking,
  type DemoShow,
} from "@/lib/zingaraDemo";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
export const runtime = "nodejs";

const bookingMetadataPrefix = "__zingara_booking_meta__:";

type RouteContext = {
  params: Promise<{ reference: string }>;
};

type BookingRow = {
  archived_at: string | null;
  booking_origin: string | null;
  booking_reference: string;
  booking_source: string;
  booking_status: string;
  corporate_request_id: string | null;
  guest_count: number;
  id: string;
  notes: string | null;
  public_checkout_superseded_by: string | null;
  section: string | null;
  show_id: string;
  table_id: string | null;
};

type ShowRow = DemoShow & {
  name?: string;
  venue?: string | null;
};

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

function getStaffRole(
  profile: NonNullable<Awaited<ReturnType<typeof requireActiveStaff>>["staffProfile"]>,
) {
  return Array.isArray(profile.roles) ? profile.roles[0] : profile.roles;
}

async function loadBooking(
  serviceClient: NonNullable<Awaited<ReturnType<typeof requireActiveStaff>>["serviceClient"]>,
  reference: string,
) {
  const selection =
    "id,show_id,table_id,booking_reference,booking_source,booking_origin,corporate_request_id,guest_count,booking_status,section,notes,archived_at,public_checkout_superseded_by";
  const { data: directBooking, error: directError } = await serviceClient
    .from("bookings")
    .select(selection)
    .eq("booking_reference", reference)
    .maybeSingle();

  if (directError) {
    throw directError;
  }

  if (directBooking) {
    return directBooking as BookingRow;
  }

  const { data: ticketRow, error: ticketError } = await serviceClient
    .from("tickets")
    .select("booking_id")
    .eq("ticket_code", reference)
    .maybeSingle();

  if (ticketError) {
    throw ticketError;
  }

  if (!ticketRow?.booking_id) {
    return null;
  }

  const { data: linkedBooking, error: linkedError } = await serviceClient
    .from("bookings")
    .select(selection)
    .eq("id", ticketRow.booking_id)
    .maybeSingle();

  if (linkedError) {
    throw linkedError;
  }

  return linkedBooking as BookingRow | null;
}

function unavailableResponse(message: string, status = 409) {
  return Response.json({ available: false, count: 0, error: message }, { status });
}

export async function GET(request: Request, context: RouteContext) {
  const auth = await requireActiveStaff(request);

  if (auth.error || !auth.serviceClient || !auth.staffProfile) {
    return auth.error;
  }

  if (!getRolePermissions(getStaffRole(auth.staffProfile)).includes("bookings:manage")) {
    return unavailableResponse("Booking management access is required.", 403);
  }

  try {
    const { reference } = await context.params;
    const normalizedReference = normalizeTicketReference(reference);
    const bookingRow = await loadBooking(auth.serviceClient, normalizedReference);

    if (!bookingRow) {
      return unavailableResponse("Booking could not be found.", 404);
    }

    const [showResult, ticketResult, tableResult, venueResult] = await Promise.all([
      auth.serviceClient
        .from("shows")
        .select("id,date,time,name,notes,venue")
        .eq("id", bookingRow.show_id)
        .maybeSingle(),
      auth.serviceClient
        .from("tickets")
        .select("id,booking_id,ticket_code,qr_payload,ticket_status,issued_at")
        .eq("booking_id", bookingRow.id),
      bookingRow.table_id
        ? auth.serviceClient
            .from("show_tables")
            .select("table_code,booking_id")
            .eq("id", bookingRow.table_id)
            .eq("booking_id", bookingRow.id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      auth.serviceClient
        .from("venue_settings")
        .select("venue_key,name,settings")
        .limit(1)
        .maybeSingle(),
    ]);

    for (const result of [showResult, ticketResult, tableResult, venueResult]) {
      if (result.error) {
        throw result.error;
      }
    }

    const show = showResult.data as ShowRow | null;
    const showLocation = normalizeShowLocation(show?.venue ?? show?.location);
    const venueScope = normalizeStaffVenueScope(auth.staffProfile.venue_scope ?? []);

    if (
      !showLocation ||
      (!venueScope.includes("all") && !venueScope.includes(showLocation))
    ) {
      return unavailableResponse("This booking is outside your venue access.", 403);
    }

    if (
      !isAuthoritativeCorporateBooking({
        bookingOrigin: bookingRow.booking_origin,
        bookingSource: bookingRow.booking_source,
        corporateRequestId: bookingRow.corporate_request_id,
      })
    ) {
      return unavailableResponse(
        "Download All Tickets is available for Corporate bookings with individual tickets.",
        403,
      );
    }

    if (
      bookingRow.archived_at ||
      bookingRow.public_checkout_superseded_by ||
      ["cancelled", "refunded"].includes(bookingRow.booking_status)
    ) {
      return unavailableResponse("No valid tickets are available to download.");
    }

    const metadata = parseBookingMetadata(bookingRow.notes);

    if (!metadata) {
      return unavailableResponse(
        "This booking uses a booking-level ticket and has no individual ticket bundle.",
      );
    }

    const zoneId = normalizeBookingZone(bookingRow.section) ?? metadata.zoneId;
    const booking: DemoBooking = {
      ...metadata,
      partySize: bookingRow.guest_count,
      reference: bookingRow.booking_reference,
      showId: bookingRow.show_id,
      tableId: bookingRow.table_id ?? "",
      tableNumber:
        (tableResult.data as { table_code?: string } | null)?.table_code ??
        metadata.tableNumber,
      zoneId,
      zoneTitle: getDisplayZoneTitle(zoneId, bookingRow.section ?? metadata.zoneTitle),
    };
    const population = resolveDownloadableTicketPopulation(
      booking,
      (ticketResult.data ?? []) as PersistedTicketIdentity[],
    );
    const url = new URL(request.url);

    if (url.searchParams.get("manifest") === "1") {
      return Response.json({
        available: population.length > 0,
        count: population.length,
        filename: getAllTicketsZipFilename(booking.reference),
      });
    }

    if (population.length === 0) {
      return unavailableResponse("No valid tickets are available to download.");
    }

    const venueSettings = resolveTicketVenueSettings(
      venueResult.data as TicketVenueSettingsRow | null,
    );
    const normalizedShow = show
      ? { ...show, location: showLocation }
      : null;
    const secretPassword = normalizedShow
      ? await resolveOptionalServerSecretPassword({
          client: auth.serviceClient,
          settings: venueSettings,
          show: normalizedShow,
          venueLocation: showLocation,
        })
      : null;
    const tableColour = resolveTicketTableColour(booking);
    const entries = population.map(({ row, ticket }) => {
      const source: DownloadableTicketPdfSource = {
        booking,
        secretPassword,
        show: normalizedShow,
        tableColour,
        ticket,
        venueSettings,
      };

      return {
        input: resolveDownloadableTicketPdfInput(source),
        issuedAt: row.issued_at,
        ticketCode: row.ticket_code,
      };
    });
    const zip = await createAllTicketsZip(entries);
    const filename = getAllTicketsZipFilename(booking.reference);
    const responseBody = new ArrayBuffer(zip.byteLength);

    new Uint8Array(responseBody).set(zip);

    return new Response(responseBody, {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(zip.byteLength),
        "Content-Type": "application/zip",
        "X-Content-Type-Options": "nosniff",
        "X-Ticket-Count": String(entries.length),
      },
    });
  } catch (error) {
    console.error("[Zingara tickets] Bulk ticket download failed", error);
    return unavailableResponse("Tickets could not be prepared for download.", 500);
  }
}
