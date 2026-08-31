import { rolePermissions } from "@/lib/zingaraAccess";
import {
  loadCorporateRequestRecord,
  toSupabaseCorporateRequest,
} from "@/lib/supabase/corporateRequestsServer";
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

  const now = new Date().toISOString();
  const convertedRequest = {
    ...record.request,
    assignedConsultant:
      record.request.assignedConsultant ??
      auth.staffProfile.full_name ??
      auth.user.email ??
      undefined,
    linkedBookingReference: booking.reference,
    status: "converted" as const,
    updatedAt: now,
  };
  const convertedPayload = toSupabaseCorporateRequest(convertedRequest);
  const { data: claimedRow, error: claimError } = await auth.serviceClient
    .from("corporate_requests")
    .update(convertedPayload)
    .eq("id", record.row.id)
    .eq("status", "confirmed")
    .is("linked_booking_reference", null)
    .is("archived_at", null)
    .select("id")
    .maybeSingle();

  if (claimError) {
    return Response.json({ error: "Unable to reserve this conversion." }, { status: 500 });
  }

  if (!claimedRow) {
    const latest = await loadCorporateRequestRecord(auth.serviceClient, requestId);

    if (latest?.request.linkedBookingReference) {
      return Response.json({
        bookingReference: latest.request.linkedBookingReference,
        idempotent: true,
        request: latest.request,
      });
    }

    return Response.json(
      { error: "This Corporate enquiry changed before conversion. Refresh status." },
      { status: 409 },
    );
  }

  const bookingWithClaim: ConversionBooking = {
    ...booking,
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

    return Response.json({
      bookingReference: booking.reference,
      durationMs: Math.round(performance.now() - startedAt),
      idempotent: false,
      request: convertedRequest,
    });
  } catch (error) {
    const { data: existingBooking } = await auth.serviceClient
      .from("bookings")
      .select("booking_reference")
      .eq("booking_reference", booking.reference)
      .maybeSingle();

    if (existingBooking) {
      return Response.json({
        bookingReference: booking.reference,
        durationMs: Math.round(performance.now() - startedAt),
        idempotent: true,
        request: convertedRequest,
      });
    }

    const previousPayload = toSupabaseCorporateRequest(record.request);
    const { error: rollbackError } = await auth.serviceClient
      .from("corporate_requests")
      .update(previousPayload)
      .eq("id", record.row.id)
      .eq("linked_booking_reference", booking.reference);

    if (rollbackError) {
      return Response.json(
        {
          error:
            "Conversion result is uncertain. Refresh the enquiry before taking another action.",
          uncertain: true,
        },
        { status: 503 },
      );
    }

    return Response.json({ error: safeConversionError(error) }, { status: 409 });
  }
}
