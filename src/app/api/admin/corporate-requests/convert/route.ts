import { rolePermissions } from "@/lib/zingaraAccess";
import { loadCorporateRequestRecord } from "@/lib/supabase/corporateRequestsServer";
import {
  getAdminRoleFromName,
  requireActiveStaff,
} from "@/lib/supabase/serverAdmin";
import type { DemoBooking } from "@/lib/zingaraDemo";
import { getCorporateConversionGate } from "@/lib/corporateConversionGuard";

export const dynamic = "force-dynamic";

type ConversionBooking = DemoBooking & {
  reservationTableClaims?: Array<{
    capacity: number;
    primary: boolean;
    section: string;
    tableCode: string;
  }>;
};

function safeConversionError(error: unknown) {
  return error instanceof Error && error.message
    ? error.message
    : "Unable to convert booking.";
}

export async function POST(request: Request) {
  const startedAt = performance.now();
  const auth = await requireActiveStaff(request);

  if (auth.error || !auth.serviceClient || !auth.staffProfile || !auth.user) {
    return auth.error;
  }

  const roleRow = Array.isArray(auth.staffProfile.roles)
    ? auth.staffProfile.roles[0]
    : auth.staffProfile.roles;
  const role = getAdminRoleFromName(roleRow?.name);

  if (!role || !rolePermissions[role].includes("bookings:manage")) {
    return Response.json(
      { error: "Booking management access is required." },
      { status: 403 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    booking?: DemoBooking;
    requestId?: string;
  };
  const booking = body.booking;
  const requestId = body.requestId?.trim();

  if (!requestId || !booking?.reference || !booking.tableId) {
    return Response.json(
      { error: "A Corporate enquiry and table-backed booking are required." },
      { status: 400 },
    );
  }

  const record = await loadCorporateRequestRecord(auth.serviceClient, requestId);

  if (!record) {
    return Response.json({ error: "Corporate enquiry was not found." }, { status: 404 });
  }

  const conversionGate = getCorporateConversionGate(record.request);

  if (conversionGate.outcome === "idempotent") {
    return Response.json({
      bookingReference: conversionGate.bookingReference,
      idempotent: true,
      request: record.request,
    });
  }

  if (conversionGate.outcome === "blocked") {
    return Response.json(
      { error: conversionGate.reason },
      { status: 409 },
    );
  }

  if (
    booking.source !== "corporate-direct" ||
    booking.partySize !== record.request.guestCount ||
    booking.customer.name.trim() !== record.request.contactName.trim() ||
    booking.customer.email.trim().toLowerCase() !==
      record.request.email.trim().toLowerCase()
  ) {
    return Response.json(
      { error: "Corporate customer or guest details no longer match." },
      { status: 409 },
    );
  }

  const { data: table, error: tableError } = await auth.serviceClient
    .from("show_tables")
    .select("id,show_id,table_code,section,capacity,status,booking_id,merged_parent_id")
    .eq("id", booking.tableId)
    .maybeSingle();

  if (tableError || !table) {
    return Response.json(
      { error: "The selected table is no longer available." },
      { status: 409 },
    );
  }

  if (
    table.status !== "available" ||
    table.booking_id ||
    table.merged_parent_id ||
    Number(table.capacity) < booking.partySize
  ) {
    return Response.json(
      { error: "The selected table is no longer available." },
      { status: 409 },
    );
  }

  const bookingWithClaim: ConversionBooking = {
    ...booking,
    corporateRequestId: record.row.id,
    reservationTableClaims: [
      {
        capacity: Number(table.capacity),
        primary: true,
        section: table.section ?? booking.zoneTitle,
        tableCode: table.table_code,
      },
    ],
  };

  try {
    const headers = new Headers({ "Content-Type": "application/json" });
    const authorization = request.headers.get("authorization");
    const cookie = request.headers.get("cookie");

    if (authorization) headers.set("authorization", authorization);
    if (cookie) headers.set("cookie", cookie);

    const bookingResponse = await fetch(new URL("/api/admin/bookings", request.url), {
      body: JSON.stringify({ booking: bookingWithClaim }),
      headers,
      method: "POST",
    });
    const bookingResult = (await bookingResponse.json().catch(() => ({}))) as {
      error?: string;
    };

    if (!bookingResponse.ok) {
      throw new Error(bookingResult.error ?? "Unable to create booking.");
    }

    const convertedRecord = await loadCorporateRequestRecord(
      auth.serviceClient,
      record.row.id,
    );

    if (
      !convertedRecord ||
      convertedRecord.request.status !== "converted" ||
      convertedRecord.request.linkedBookingReference !== booking.reference ||
      convertedRecord.row.linked_booking_id === null
    ) {
      throw new Error(
        "Corporate booking was created without an authoritative enquiry link.",
      );
    }

    return Response.json({
      bookingReference: booking.reference,
      durationMs: Math.round(performance.now() - startedAt),
      idempotent: false,
      request: convertedRecord.request,
    });
  } catch (error) {
    const latest = await loadCorporateRequestRecord(
      auth.serviceClient,
      record.row.id,
    );

    if (latest?.request.linkedBookingReference) {
      return Response.json({
        bookingReference: latest.request.linkedBookingReference,
        durationMs: Math.round(performance.now() - startedAt),
        idempotent: true,
        request: latest.request,
      });
    }

    return Response.json({ error: safeConversionError(error) }, { status: 409 });
  }
}
