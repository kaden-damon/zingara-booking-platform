import {
  isSuperAdminProfile,
  requireActiveStaff,
} from "@/lib/supabase/serverAdmin";
import { recordAuditEvent, tryRecordAuditEvent } from "@/lib/supabase/serverAudit";
import {
  createShortBookingReference,
  createTicketCode,
  getDisplayZoneTitle,
  getVenueZoneSeatCapacity,
  isValidSeatingZoneId,
  type DemoBooking,
  type SeatingZoneId,
} from "@/lib/zingaraDemo";

export const dynamic = "force-dynamic";

const qaPurpose = "PHASE 38.2B APPLE WALLET LIVE UPDATE QA";
const qaNote = `${qaPurpose} – SYNTHETIC TEST RECORD`;
const activeCapacityStatuses = [
  "checked_in",
  "confirmed",
  "new",
  "pending_payment",
];

type ShowRow = {
  date: string;
  id: string;
  name: string;
  status: string;
  time: string;
  venue: string;
};

type ShowTableRow = {
  availability_scope: string | null;
  booking_id: string | null;
  capacity: number;
  capacity_configured: boolean | null;
  id: string;
  is_physical: boolean | null;
  merged_from: string[] | null;
  merged_parent_id: string | null;
  section: string;
  show_id: string;
  status: string;
  table_code: string;
  venue_table_id: string | null;
};

type BookingRow = {
  booking_reference: string;
  created_at: string;
  customer_id: string;
  guest_count: number;
  id: string;
  notes: string | null;
  section: string | null;
  show_id: string;
  table_id: string | null;
};

function normalizeZone(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase().replaceAll(" ", "-") ?? "";

  if (
    [
      "booth",
      "booths",
      "private-booth",
      "private-booths",
      "royal-booth",
      "royal-booths",
    ].includes(normalized)
  ) {
    return "royal-booths";
  }

  return normalized;
}

function toDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

async function createUniqueReference(
  serviceClient: NonNullable<
    Awaited<ReturnType<typeof requireActiveStaff>>["serviceClient"]
  >,
) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const reference = createShortBookingReference();
    const { data, error } = await serviceClient
      .from("bookings")
      .select("id")
      .eq("booking_reference", reference)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      return reference;
    }
  }

  throw new Error("A unique QA booking reference could not be generated.");
}

async function findSafePerformance(
  serviceClient: NonNullable<
    Awaited<ReturnType<typeof requireActiveStaff>>["serviceClient"]
  >,
) {
  const earliestDate = new Date();
  earliestDate.setUTCDate(earliestDate.getUTCDate() + 30);

  const { data: shows, error: showsError } = await serviceClient
    .from("shows")
    .select("id,name,date,time,venue,status")
    .eq("status", "active")
    .gt("date", toDateOnly(earliestDate))
    .order("date", { ascending: false })
    .order("time", { ascending: false })
    .limit(80);

  if (showsError) {
    throw showsError;
  }

  for (const show of (shows ?? []) as ShowRow[]) {
    const { data: tables, error: tablesError } = await serviceClient
      .from("show_tables")
      .select(
        "id,show_id,venue_table_id,table_code,section,capacity,status,booking_id,merged_parent_id,merged_from,availability_scope,capacity_configured,is_physical",
      )
      .eq("show_id", show.id)
      .eq("status", "available")
      .eq("is_physical", true)
      .eq("capacity_configured", true)
      .is("booking_id", null)
      .is("merged_parent_id", null)
      .not("venue_table_id", "is", null)
      .order("capacity", { ascending: true })
      .order("table_code", { ascending: true });

    if (tablesError) {
      throw tablesError;
    }

    const candidates = ((tables ?? []) as ShowTableRow[]).filter(
      (table) =>
        table.availability_scope === "public" &&
        (table.merged_from?.length ?? 0) === 0 &&
        isValidSeatingZoneId(normalizeZone(table.section)),
    );

    for (const table of candidates) {
      const zoneId = normalizeZone(table.section) as SeatingZoneId;
      const { data: bookingRows, error: bookingsError } = await serviceClient
        .from("bookings")
        .select("guest_count,section")
        .eq("show_id", show.id)
        .is("archived_at", null)
        .in("booking_status", activeCapacityStatuses);

      if (bookingsError) {
        throw bookingsError;
      }

      const occupied = (bookingRows ?? []).reduce(
        (total, booking) =>
          normalizeZone(booking.section) === zoneId
            ? total + Math.max(Number(booking.guest_count) || 0, 0)
            : total,
        0,
      );
      const capacity = getVenueZoneSeatCapacity(zoneId);

      if (occupied + 1 <= capacity) {
        return { occupied, show, table, zoneId, zoneTitle: getDisplayZoneTitle(zoneId) };
      }
    }
  }

  return null;
}

function buildDemoBooking(
  booking: BookingRow,
  show: ShowRow,
  zoneId: SeatingZoneId,
  zoneTitle: string,
): DemoBooking {
  return {
    amountPaid: 0,
    balanceDue: 0,
    bookingDate: show.date,
    communicationHistory: [],
    createdAt: booking.created_at,
    customer: {
      email: "",
      name: "Apple Wallet QA",
      phone: "",
    },
    customerId: booking.customer_id,
    operationalNotes: qaNote,
    partySize: 1,
    paymentOption: "full",
    paymentStatus: "comp-vip",
    pricePerPerson: 0,
    reference: booking.booking_reference,
    showId: show.id,
    source: "admin",
    status: "confirmed",
    subtotalPrice: 0,
    supabaseBookingId: booking.id,
    tableId: "requires-floor-assignment",
    tableNumber: "Requires floor assignment",
    ticketCode: createTicketCode(booking.booking_reference),
    ticketIssuedAt: booking.created_at,
    totalPrice: 0,
    zoneId,
    zoneTitle,
  };
}

export async function POST(request: Request) {
  const auth = await requireActiveStaff(request);

  if (auth.error || !auth.serviceClient || !auth.staffProfile || !auth.user) {
    return auth.error;
  }

  if (!isSuperAdminProfile(auth.staffProfile)) {
    await tryRecordAuditEvent(
      auth.serviceClient,
      auth.staffProfile,
      auth.user,
      {
        action: "platform-qa.wallet-booking-create",
        entityReference: qaPurpose,
        entityType: "booking",
        outcome: "blocked",
        reason: "Super Admin access is required.",
        request,
        sourceArea: "Platform QA",
      },
    );

    return Response.json(
      { error: "Super Admin access is required." },
      { status: 403 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    confirmSyntheticQaBooking?: boolean;
    purpose?: string;
  };

  if (body.purpose !== qaPurpose || body.confirmSyntheticQaBooking !== true) {
    return Response.json(
      { error: "Explicit Wallet QA purpose and confirmation are required." },
      { status: 400 },
    );
  }

  const { data: existingRows, error: existingError } = await auth.serviceClient
    .from("bookings")
    .select(
      "id,customer_id,show_id,table_id,booking_reference,guest_count,section,notes,created_at",
    )
    .ilike("notes", `%${qaPurpose}%`)
    .order("created_at", { ascending: true })
    .limit(2);

  if (existingError) {
    throw existingError;
  }

  if ((existingRows?.length ?? 0) > 1) {
    return Response.json(
      { error: "Multiple Wallet QA bookings exist. Stop and investigate." },
      { status: 409 },
    );
  }

  const safePerformance = await findSafePerformance(auth.serviceClient);

  if (!safePerformance) {
    return Response.json(
      { error: "No safe future performance and physical table are available." },
      { status: 409 },
    );
  }

  const existingBooking = (existingRows?.[0] as BookingRow | undefined) ?? null;

  if (existingBooking) {
    if (existingBooking.show_id !== safePerformance.show.id) {
      return Response.json(
        {
          error:
            "The existing Wallet QA booking targets a different performance. Stop and inspect it.",
        },
        { status: 409 },
      );
    }

    return Response.json({
      booking: buildDemoBooking(
        existingBooking,
        safePerformance.show,
        safePerformance.zoneId,
        safePerformance.zoneTitle,
      ),
      created: false,
      performance: {
        date: safePerformance.show.date,
        location: safePerformance.show.venue,
        name: safePerformance.show.name,
        time: safePerformance.show.time,
      },
      targetTable: {
        capacity: safePerformance.table.capacity,
        id: safePerformance.table.id,
        tableCode: safePerformance.table.table_code,
      },
      zone: {
        id: safePerformance.zoneId,
        title: safePerformance.zoneTitle,
      },
    });
  }

  const reference = await createUniqueReference(auth.serviceClient);
  const now = new Date().toISOString();
  const { data: customer, error: customerError } = await auth.serviceClient
    .from("customers")
    .insert({
      email: null,
      first_name: "Apple Wallet",
      mobile: null,
      preferences: {
        excludeFromOperationalReporting: true,
        qaPurpose,
        synthetic: true,
      },
      relationship_notes: qaNote,
      surname: "QA",
    })
    .select("id")
    .single();

  if (customerError || !customer) {
    throw customerError ?? new Error("Synthetic QA customer could not be created.");
  }

  const customerId = (customer as { id: string }).id;
  const { data: booking, error: bookingError } = await auth.serviceClient
    .from("bookings")
    .insert({
      amount_paid: 0,
      balance_outstanding: 0,
      booking_reference: reference,
      booking_source: "admin",
      booking_status: "confirmed",
      customer_id: customerId,
      discount_amount: 0,
      guest_count: 1,
      notes: qaNote,
      payment_status: "comp_vip",
      section: safePerformance.zoneId,
      service_fee: 0,
      show_id: safePerformance.show.id,
      subtotal_amount: 0,
      table_id: null,
      total_amount: 0,
    })
    .select(
      "id,customer_id,show_id,table_id,booking_reference,guest_count,section,notes,created_at",
    )
    .single();

  if (bookingError || !booking) {
    await auth.serviceClient.from("customers").delete().eq("id", customerId);
    throw bookingError ?? new Error("Synthetic QA booking could not be created.");
  }

  const bookingRow = booking as BookingRow;

  try {
    await recordAuditEvent(
      auth.serviceClient,
      auth.staffProfile,
      auth.user,
      {
        action: "platform-qa.wallet-booking-create",
        afterValues: {
          bookingStatus: "confirmed",
          customerId,
          guestCount: 1,
          paymentStatus: "comp_vip",
          purpose: qaPurpose,
          showId: safePerformance.show.id,
          tableId: null,
          totalAmount: 0,
          zone: safePerformance.zoneId,
        },
        changedFields: [
          "customer_id",
          "show_id",
          "table_id",
          "booking_status",
          "payment_status",
          "guest_count",
          "section",
          "total_amount",
          "notes",
        ],
        entityId: bookingRow.id,
        entityLocation: safePerformance.show.venue,
        entityReference: reference,
        entityType: "booking",
        outcome: "success",
        reason: "Created controlled synthetic Apple Wallet live-update QA booking.",
        request,
        sourceArea: "Platform QA",
      },
    );
  } catch (error) {
    await auth.serviceClient.from("bookings").delete().eq("id", bookingRow.id);
    await auth.serviceClient.from("customers").delete().eq("id", customerId);
    throw error;
  }

  return Response.json({
    booking: buildDemoBooking(
      bookingRow,
      safePerformance.show,
      safePerformance.zoneId,
      safePerformance.zoneTitle,
    ),
    created: true,
    performance: {
      date: safePerformance.show.date,
      location: safePerformance.show.venue,
      name: safePerformance.show.name,
      time: safePerformance.show.time,
    },
    targetTable: {
      capacity: safePerformance.table.capacity,
      id: safePerformance.table.id,
      tableCode: safePerformance.table.table_code,
    },
    zone: {
      id: safePerformance.zoneId,
      title: safePerformance.zoneTitle,
    },
  });
}
