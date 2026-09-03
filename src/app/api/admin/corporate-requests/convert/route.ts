import { rolePermissions } from "@/lib/zingaraAccess";
import { loadCorporateRequestRecord } from "@/lib/supabase/corporateRequestsServer";
import {
  getAdminRoleFromName,
  requireActiveStaff,
} from "@/lib/supabase/serverAdmin";
import {
  getBookingCapacityConflictResponse,
  validateBookingCapacityIncrease,
} from "@/lib/supabase/bookingCapacity";
import {
  getDisplayZoneTitle,
  type DemoBooking,
} from "@/lib/zingaraDemo";
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

function getLegacyShowId(notes: string | null) {
  if (!notes?.startsWith("__zingara_show_meta__:")) return "";

  try {
    return String(
      (JSON.parse(notes.slice("__zingara_show_meta__:".length)) as {
        legacyId?: unknown;
      }).legacyId ?? "",
    );
  } catch {
    return "";
  }
}

function hasValidReviewedFinancials(booking: DemoBooking) {
  const total = Number(booking.totalPrice);
  const paid = Number(booking.amountPaid);
  const outstanding = Number(booking.balanceDue);

  if (
    !Number.isFinite(total) ||
    !Number.isFinite(paid) ||
    !Number.isFinite(outstanding) ||
    total < 0 ||
    paid < 0 ||
    paid > total ||
    Math.abs(total - paid - outstanding) > 0.005
  ) {
    return false;
  }

  if (booking.paymentStatus === "comp-vip") {
    return (
      booking.status === "confirmed" &&
      total === 0 &&
      paid === 0 &&
      outstanding === 0
    );
  }
  if (booking.paymentStatus === "fully-paid") {
    return (
      booking.status === "confirmed" &&
      total > 0 &&
      paid === total &&
      outstanding === 0
    );
  }
  if (booking.paymentStatus === "deposit-paid") {
    return (
      booking.status === "pending-payment" &&
      paid > 0 &&
      paid < total &&
      outstanding > 0
    );
  }

  return (
    booking.status === "pending-payment" &&
    booking.paymentStatus === "pending-payment" &&
    total > 0 &&
    paid === 0
  );
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

  if (!requestId || !booking?.reference) {
    return Response.json(
      { error: "A Corporate enquiry and reviewed booking are required." },
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
    !Number.isInteger(booking.partySize) ||
    booking.partySize <= 0 ||
    booking.customer.name.trim() !== record.request.contactName.trim() ||
    booking.customer.email.trim().toLowerCase() !==
      record.request.email.trim().toLowerCase()
  ) {
    return Response.json(
      { error: "Corporate customer or guest details no longer match." },
      { status: 409 },
    );
  }

  if (!hasValidReviewedFinancials(booking)) {
    return Response.json(
      { error: "The reviewed Corporate financials are incomplete or inconsistent." },
      { status: 400 },
    );
  }

  const { data: showRows, error: showsError } = await auth.serviceClient
    .from("shows")
    .select("id,notes,status")
    .in("status", ["active", "special_event"]);
  const show = (showRows ?? []).find(
    (row) =>
      row.id === booking.showId || getLegacyShowId(row.notes) === booking.showId,
  );

  if (showsError || !show) {
    return Response.json(
      { error: "The selected performance is no longer available." },
      { status: 409 },
    );
  }

  const capacityResult = await validateBookingCapacityIncrease(
    auth.serviceClient,
    {
      bookingReference: booking.reference,
      bookingStatus:
        booking.status === "pending-payment" ? "pending_payment" : booking.status,
      guestCount: booking.partySize,
      section: getDisplayZoneTitle(booking.zoneId, booking.zoneTitle),
      showId: show.id,
    },
  );

  if (!capacityResult.allowed) {
    return getBookingCapacityConflictResponse(capacityResult);
  }

  let table: {
    booking_id: string | null;
    capacity: number;
    id: string;
    merged_parent_id: string | null;
    section: string | null;
    show_id: string;
    status: string;
    table_code: string;
  } | null = null;

  if (booking.tableId) {
    const { data, error } = await auth.serviceClient
      .from("show_tables")
      .select("id,show_id,table_code,section,capacity,status,booking_id,merged_parent_id")
      .eq("id", booking.tableId)
      .maybeSingle();

    table = data;

    if (
      error ||
      !table ||
      table.show_id !== show.id ||
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
  }

  const bookingWithClaim: ConversionBooking = {
    ...booking,
    corporateRequestId: record.row.id,
    reservationTableClaims: table
      ? [
          {
            capacity: Number(table.capacity),
            primary: true,
            section: table.section ?? booking.zoneTitle,
            tableCode: table.table_code,
          },
        ]
      : [],
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
