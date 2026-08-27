import {
  getAdminRoleFromName,
  getRequestingUser,
  getServiceClient,
  requireActiveStaff,
} from "@/lib/supabase/serverAdmin";
import {
  diffAuditFields,
  pickAuditFields,
  recordAuditEvent,
  tryRecordAuditEvent,
} from "@/lib/supabase/serverAudit";
import type {
  BookingLifecycleEvent,
  BookingStatus,
  DemoBooking,
} from "@/lib/zingaraDemo";
import { enforceCorporateBookingSource } from "@/lib/bookingClassification";
import { notifyAppleWalletBooking } from "@/lib/appleWalletSync";
import { normalizeStaffVenueScope } from "@/lib/staffLocations";
import { rolePermissions } from "@/lib/zingaraAccess";
import { normalizeShowLocation } from "@/lib/zingaraDemo";
import type { SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const bookingSelect =
  "id,customer_id,show_id,table_id,booking_reference,booking_source,company_name,guest_count,booking_status,payment_status,section,service_fee,subtotal_amount,discount_amount,addons_total,total_amount,amount_paid,balance_outstanding,notes,dietary_requirements,archived_at,archived_by,archive_reason,created_at,updated_at";
const bookingMetadataPrefix = "__zingara_booking_meta__:";
const bookingQueryBatchSize = 1000;
const aggregateQueryBatchSize = 150;
const bookingAuditFields = [
  "booking_source",
  "booking_status",
  "payment_status",
  "guest_count",
  "section",
  "table_id",
  "total_amount",
  "amount_paid",
  "balance_outstanding",
  "notes",
  "dietary_requirements",
  "archived_at",
  "archived_by",
  "archive_reason",
  "customer_id",
  "show_id",
];

type SupabaseBookingStatus =
  | "cancelled"
  | "checked_in"
  | "completed"
  | "confirmed"
  | "new"
  | "no_show"
  | "pending_payment"
  | "refunded"
  | "waitlisted";

type SupabasePaymentStatus =
  | "cancelled"
  | "comp_vip"
  | "deposit_paid"
  | "fully_paid"
  | "pending_payment"
  | "refunded";

type AdminBookingRow = {
  booking_reference?: string;
  customer_id: string | null;
  id: string;
  show_id: string;
  table_id: string | null;
  [key: string]: unknown;
};

async function fetchAdminBookingIdentityRows(serviceClient: SupabaseClient) {
  const rows: Array<{ booking_reference: string; id: string }> = [];

  for (let from = 0; ; from += bookingQueryBatchSize) {
    const { data, error } = await serviceClient
      .from("bookings")
      .select("id,booking_reference")
      .order("created_at", { ascending: false })
      .range(from, from + bookingQueryBatchSize - 1);

    if (error) {
      return { error, rows };
    }

    const batch = (data ?? []) as Array<{
      booking_reference: string;
      id: string;
    }>;
    rows.push(...batch);

    if (batch.length < bookingQueryBatchSize) {
      return { error: null, rows };
    }
  }
}

type ShowTableAssignmentRow = {
  availability_scope?: string | null;
  booking_id: string | null;
  capacity?: number | null;
  capacity_configured?: boolean;
  id: string;
  is_physical?: boolean;
  is_override?: boolean;
  merged_from?: string[] | null;
  merged_parent_id?: string | null;
  section: string;
  show_id: string;
  status: string;
  table_code: string;
};

function normalizeTableZone(section: string | null | undefined) {
  const normalized = section?.trim().toLowerCase() ?? "";

  if (
    [
      "booth",
      "booths",
      "private booth",
      "private booths",
      "royal booth",
      "royal booths",
      "royal-booths",
    ].includes(normalized)
  ) {
    return "royal-booths";
  }

  return normalized.replaceAll(" ", "-");
}

async function fetchAdminBookingRows(
  serviceClient: SupabaseClient,
  reference: string | null,
) {
  const rows: AdminBookingRow[] = [];

  for (let from = 0; ; from += bookingQueryBatchSize) {
    let query = serviceClient.from("bookings").select(bookingSelect);

    if (reference) {
      query = query.eq("booking_reference", reference);
    }

    const { data, error } = await query
      .order("created_at", { ascending: false })
      .range(from, from + bookingQueryBatchSize - 1);

    if (error) {
      return { error, rows };
    }

    const batch = (data ?? []) as AdminBookingRow[];
    rows.push(...batch);

    if (batch.length < bookingQueryBatchSize) {
      return { error: null, rows };
    }
  }
}

async function fetchAggregateRows(
  serviceClient: SupabaseClient,
  tableName: string,
  select: string,
  column: string,
  ids: string[],
  order?: { ascending: boolean; column: string },
) {
  const uniqueIds = [...new Set(ids)].filter(Boolean);
  const rows: unknown[] = [];
  const concurrentBatchCount = 4;

  for (
    let index = 0;
    index < uniqueIds.length;
    index += aggregateQueryBatchSize * concurrentBatchCount
  ) {
    const batchResults = await Promise.all(
      Array.from({ length: concurrentBatchCount }, (_, batchIndex) => {
        const batchStart = index + batchIndex * aggregateQueryBatchSize;
        const batchIds = uniqueIds.slice(
          batchStart,
          batchStart + aggregateQueryBatchSize,
        );

        if (batchIds.length === 0) {
          return Promise.resolve({ data: [], error: null });
        }

        let query = serviceClient
          .from(tableName)
          .select(select)
          .in(column, batchIds);

        if (order) {
          query = query.order(order.column, { ascending: order.ascending });
        }

        return query;
      }),
    );

    for (const result of batchResults) {
      if (result.error) {
        return { error: result.error, rows };
      }

      rows.push(...(result.data ?? []));
    }
  }

  return { error: null, rows };
}

function toSupabaseBookingStatus(status: BookingStatus): SupabaseBookingStatus {
  if (status === "pending-payment" || status === "pending") {
    return "pending_payment";
  }

  if (status === "checked-in") {
    return "checked_in";
  }

  if (status === "no-show") {
    return "no_show";
  }

  return status;
}

function toSupabasePaymentStatus(status?: DemoBooking["paymentStatus"]): SupabasePaymentStatus {
  if (status === "deposit-paid") {
    return "deposit_paid";
  }

  if (status === "fully-paid") {
    return "fully_paid";
  }

  if (status === "comp-vip") {
    return "comp_vip";
  }

  if (status === "refunded") {
    return "refunded";
  }

  return "pending_payment";
}

function serializeBookingNotes(booking: DemoBooking) {
  return `${bookingMetadataPrefix}${JSON.stringify(booking)}`;
}

function toLifecyclePayload(event: BookingLifecycleEvent, bookingId: string) {
  return {
    booking_id: bookingId,
    created_at: event.createdAt,
    from_status: event.fromStatus
      ? toSupabaseBookingStatus(event.fromStatus)
      : null,
    note: event.note ?? null,
    reason: event.toStatus === "cancelled" ? event.note ?? null : null,
    to_status: toSupabaseBookingStatus(event.toStatus),
  };
}

export async function GET(request: Request) {
  const serviceClient = getServiceClient();

  if (!serviceClient) {
    return Response.json(
      { error: "Supabase service role is not configured." },
      { status: 500 },
    );
  }

  const url = new URL(request.url);
  const reference = url.searchParams.get("reference");
  const includeHistory = url.searchParams.get("includeHistory") !== "0";
  const historyOnly = url.searchParams.get("historyOnly") === "1";

  if (historyOnly) {
    const { rows: bookingRows, error: bookingRowsError } =
      await fetchAdminBookingIdentityRows(serviceClient);

    if (bookingRowsError) {
      console.error(
        "[Zingara API] Failed to load booking history identities",
        bookingRowsError,
      );
      return Response.json(
        { error: "Booking histories could not be loaded." },
        { status: 500 },
      );
    }

    const bookingIds = bookingRows.map((booking) => booking.id);
    const [communicationsResult, lifecycleResult] = await Promise.all([
      fetchAggregateRows(
        serviceClient,
        "communications",
        "id,customer_id,booking_id,show_id,batch_id,type,channel,subject,message,status,sent_at,created_at",
        "booking_id",
        bookingIds,
        { ascending: false, column: "sent_at" },
      ),
      fetchAggregateRows(
        serviceClient,
        "booking_lifecycle_events",
        "id,booking_id,from_status,to_status,note,reason,changed_by,created_at",
        "booking_id",
        bookingIds,
        { ascending: false, column: "created_at" },
      ),
    ]);

    if (communicationsResult.error || lifecycleResult.error) {
      console.error("[Zingara API] Failed to load booking histories", {
        communicationsError: communicationsResult.error,
        lifecycleError: lifecycleResult.error,
      });
      return Response.json(
        { error: "Booking histories could not be loaded." },
        { status: 500 },
      );
    }

    const communicationsByBookingId = new Map<string, unknown[]>();
    for (const communication of communicationsResult.rows ?? []) {
      if (
        communication &&
        typeof communication === "object" &&
        "booking_id" in communication &&
        typeof communication.booking_id === "string"
      ) {
        communicationsByBookingId.set(communication.booking_id, [
          ...(communicationsByBookingId.get(communication.booking_id) ?? []),
          communication,
        ]);
      }
    }

    const lifecycleByBookingId = new Map<string, unknown[]>();
    for (const lifecycleEvent of lifecycleResult.rows ?? []) {
      if (
        lifecycleEvent &&
        typeof lifecycleEvent === "object" &&
        "booking_id" in lifecycleEvent &&
        typeof lifecycleEvent.booking_id === "string"
      ) {
        lifecycleByBookingId.set(lifecycleEvent.booking_id, [
          ...(lifecycleByBookingId.get(lifecycleEvent.booking_id) ?? []),
          lifecycleEvent,
        ]);
      }
    }

    return Response.json({
      rows: bookingRows.map((booking) => ({
        booking_reference: booking.booking_reference,
        communication_rows:
          communicationsByBookingId.get(booking.id) ?? [],
        lifecycle_event_rows: lifecycleByBookingId.get(booking.id) ?? [],
      })),
    });
  }
  const { rows, error } = await fetchAdminBookingRows(serviceClient, reference);

  if (error) {
    console.error("[Zingara API] Failed to load bookings", error);

    return Response.json(
      { error: "Bookings could not be loaded." },
      { status: 500 },
    );
  }

  const bookingIds = rows
    .map((booking) => booking.id)
    .filter((id): id is string => Boolean(id));
  const customerIds = rows
    .map((booking) => booking.customer_id)
    .filter((id): id is string => Boolean(id));
  const tableIds = rows
    .map((booking) => booking.table_id)
    .filter((id): id is string => Boolean(id));
  const showIds = rows
    .map((booking) => booking.show_id)
    .filter((id): id is string => Boolean(id));

  if (bookingIds.length === 0) {
    return Response.json({ rows });
  }

  const [
    { rows: communications, error: communicationsError },
    { rows: lifecycleEvents, error: lifecycleError },
    { rows: customers, error: customersError },
    { rows: tables, error: tablesError },
    { rows: shows, error: showsError },
  ] = await Promise.all([
    includeHistory
      ? fetchAggregateRows(
          serviceClient,
          "communications",
          "id,customer_id,booking_id,show_id,batch_id,type,channel,subject,message,status,sent_at,created_at",
          "booking_id",
          bookingIds,
          { ascending: false, column: "sent_at" },
        )
      : Promise.resolve({ rows: [], error: null }),
    includeHistory
      ? fetchAggregateRows(
          serviceClient,
          "booking_lifecycle_events",
          "id,booking_id,from_status,to_status,note,reason,changed_by,created_at",
          "booking_id",
          bookingIds,
          { ascending: false, column: "created_at" },
        )
      : Promise.resolve({ rows: [], error: null }),
    customerIds.length > 0
      ? fetchAggregateRows(
          serviceClient,
          "customers",
          "id,first_name,surname,email,mobile",
          "id",
          customerIds,
        )
      : Promise.resolve({ rows: [], error: null }),
    tableIds.length > 0
      ? fetchAggregateRows(
          serviceClient,
          "show_tables",
          "id,table_code,section",
          "id",
          tableIds,
        )
      : Promise.resolve({ rows: [], error: null }),
    showIds.length > 0
      ? fetchAggregateRows(
          serviceClient,
          "shows",
          "id,notes",
          "id",
          showIds,
        )
      : Promise.resolve({ rows: [], error: null }),
  ]);

  if (communicationsError) {
    console.error(
      "[Zingara API] Failed to load booking communications aggregate",
      communicationsError,
    );
  }

  if (lifecycleError) {
    console.error(
      "[Zingara API] Failed to load booking lifecycle aggregate",
      lifecycleError,
    );
  }

  if (customersError) {
    console.error(
      "[Zingara API] Failed to load booking customer aggregate",
      customersError,
    );
  }

  if (tablesError) {
    console.error(
      "[Zingara API] Failed to load booking table aggregate",
      tablesError,
    );
  }

  if (showsError) {
    console.error(
      "[Zingara API] Failed to load booking show aggregate",
      showsError,
    );
  }

  const communicationsByBookingId = new Map<string, unknown[]>();

  for (const communication of communications ?? []) {
    if (
      !communication ||
      typeof communication !== "object" ||
      !("booking_id" in communication) ||
      typeof communication.booking_id !== "string"
    ) {
      continue;
    }

    communicationsByBookingId.set(communication.booking_id, [
      ...(communicationsByBookingId.get(communication.booking_id) ?? []),
      communication,
    ]);
  }

  const lifecycleByBookingId = new Map<string, unknown[]>();

  for (const lifecycleEvent of lifecycleEvents ?? []) {
    if (
      !lifecycleEvent ||
      typeof lifecycleEvent !== "object" ||
      !("booking_id" in lifecycleEvent) ||
      typeof lifecycleEvent.booking_id !== "string"
    ) {
      continue;
    }

    lifecycleByBookingId.set(lifecycleEvent.booking_id, [
      ...(lifecycleByBookingId.get(lifecycleEvent.booking_id) ?? []),
      lifecycleEvent,
    ]);
  }

  const customersById = new Map<string, unknown>();

  for (const customer of customers ?? []) {
    if (
      customer &&
      typeof customer === "object" &&
      "id" in customer &&
      typeof (customer as { id?: unknown }).id === "string"
    ) {
      customersById.set((customer as { id: string }).id, customer);
    }
  }

  const tablesById = new Map<string, unknown>();

  for (const table of tables ?? []) {
    if (
      table &&
      typeof table === "object" &&
      "id" in table &&
      typeof (table as { id?: unknown }).id === "string"
    ) {
      tablesById.set((table as { id: string }).id, table);
    }
  }

  const showsById = new Map<string, unknown>();

  for (const show of shows ?? []) {
    if (
      show &&
      typeof show === "object" &&
      "id" in show &&
      typeof (show as { id?: unknown }).id === "string"
    ) {
      showsById.set((show as { id: string }).id, show);
    }
  }

  return Response.json({
    rows: rows.map((booking) => ({
      ...booking,
      communication_rows: communicationsByBookingId.get(booking.id) ?? [],
      customer_row: booking.customer_id
        ? customersById.get(booking.customer_id) ?? null
        : null,
      lifecycle_event_rows: lifecycleByBookingId.get(booking.id) ?? [],
      show_row: showsById.get(booking.show_id) ?? null,
      table_row: booking.table_id
        ? tablesById.get(booking.table_id) ?? null
        : null,
    })),
  });
}

function getRouteClient() {
  return getServiceClient();
}

async function getRequestingStaffProfileId(request: Request) {
  const supabase = getRouteClient();
  const user = await getRequestingUser(request);

  if (!supabase || !user?.id) {
    return null;
  }

  const { data, error } = await supabase
    .from("staff_profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[Zingara API] Failed to resolve locking staff", error);
    return null;
  }

  return (data as { id?: string } | null)?.id ?? null;
}

async function getAuditActor(request: Request) {
  const auth = await requireActiveStaff(request);

  if (auth.error || !auth.staffProfile || !auth.user) {
    return {
      staffProfile: null,
      user: null,
    };
  }

  return {
    staffProfile: auth.staffProfile,
    user: auth.user,
  };
}

async function expireStaleBookingLocks() {
  const supabase = getRouteClient();

  if (!supabase) {
    return;
  }

  await supabase
    .from("booking_edit_locks")
    .update({
      release_reason: "heartbeat-timeout",
      released_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .is("released_at", null)
    .lt(
      "last_activity_at",
      new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    );
}

async function ensureNoConflictingBookingLock(
  request: Request,
  bookingReference?: string,
) {
  const supabase = getRouteClient();

  if (!supabase || !bookingReference) {
    return null;
  }

  await expireStaleBookingLocks();

  const { data: activeLock, error } = await supabase
    .from("booking_edit_locks")
    .select(
      "id,booking_reference,staff_profile_id,staff_name,staff_role,last_activity_at,started_at",
    )
    .eq("booking_reference", bookingReference)
    .is("released_at", null)
    .maybeSingle();

  if (error) {
    console.error("[Zingara API] Failed to verify booking edit lock", error);

    return Response.json(
      { error: "Booking edit lock could not be verified." },
      { status: 500 },
    );
  }

  if (!activeLock) {
    return null;
  }

  const requestingStaffProfileId = await getRequestingStaffProfileId(request);

  if (
    requestingStaffProfileId &&
    activeLock.staff_profile_id === requestingStaffProfileId
  ) {
    return null;
  }

  const actor = await getAuditActor(request);

  await tryRecordAuditEvent(supabase, actor.staffProfile, actor.user, {
    action: "booking.write-blocked-by-lock",
    beforeValues: pickAuditFields(activeLock as Record<string, unknown>, [
      "booking_reference",
      "staff_name",
      "staff_role",
      "last_activity_at",
      "started_at",
    ]),
    entityReference: bookingReference,
    entityType: "booking",
    outcome: "blocked",
    reason: "A valid booking edit lock exists for another staff member.",
    request,
    sourceArea: "Bookings",
  });

  return Response.json(
    {
      error: "This booking is currently being edited.",
      lock: activeLock,
    },
    { status: 409 },
  );
}

async function releaseTableClaimsForBookings(
  supabase: SupabaseClient,
  bookingIds: string[],
) {
  const uniqueBookingIds = [...new Set(bookingIds.filter(Boolean))];

  if (uniqueBookingIds.length === 0) {
    return;
  }

  const { error } = await supabase
    .from("show_tables")
    .update({
      booking_id: null,
      status: "available",
      updated_at: new Date().toISOString(),
    })
    .in("booking_id", uniqueBookingIds)
    .eq("status", "booked");

  if (error) {
    throw error;
  }
}

async function persistBookingTableAssignment(
  request: Request,
  booking: DemoBooking | undefined,
) {
  const auth = await requireActiveStaff(request);

  if (
    auth.error ||
    !auth.serviceClient ||
    !auth.staffProfile ||
    !auth.user
  ) {
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

  if (
    !booking?.reference ||
    !booking.showId ||
    !booking.tableNumber ||
    !booking.tableId
  ) {
    return Response.json(
      { error: "A valid booking table assignment is required." },
      { status: 400 },
    );
  }

  const { data: beforeBooking, error: bookingLoadError } =
    await auth.serviceClient
      .from("bookings")
      .select(bookingSelect)
      .eq("booking_reference", booking.reference)
      .maybeSingle();

  if (bookingLoadError) {
    throw bookingLoadError;
  }

  if (!beforeBooking) {
    return Response.json(
      { error: "Booking could not be resolved." },
      { status: 404 },
    );
  }

  if ((beforeBooking as { archived_at?: string | null }).archived_at) {
    return Response.json(
      { error: "Archived bookings must be restored before editing." },
      { status: 409 },
    );
  }

  const bookingId = (beforeBooking as { id: string }).id;
  const showId = (beforeBooking as { show_id: string }).show_id;
  const { data: targetTable, error: tableLoadError } =
    await auth.serviceClient
      .from("show_tables")
      .select("id,show_id,table_code,section,status,booking_id")
      .eq("show_id", showId)
      .eq("table_code", booking.tableNumber)
      .maybeSingle();

  if (tableLoadError) {
    throw tableLoadError;
  }

  const target = targetTable as ShowTableAssignmentRow | null;

  if (!target || target.section !== booking.zoneId) {
    return Response.json(
      { error: "The selected table could not be resolved for this booking." },
      { status: 404 },
    );
  }

  if (target.status === "disabled") {
    return Response.json(
      { error: `${target.table_code} is blocked and cannot accept bookings.` },
      { status: 409 },
    );
  }

  if (target.booking_id && target.booking_id !== bookingId) {
    return Response.json(
      { error: `${target.table_code} is already reserved for another booking.` },
      { status: 409 },
    );
  }

  const { data: previousClaims, error: previousClaimsError } =
    await auth.serviceClient
      .from("show_tables")
      .select("id,show_id,table_code,section,status,booking_id")
      .eq("booking_id", bookingId);

  if (previousClaimsError) {
    throw previousClaimsError;
  }

  let claimQuery = auth.serviceClient
    .from("show_tables")
    .update({
      booking_id: bookingId,
      status: "booked",
      updated_at: new Date().toISOString(),
    })
    .eq("id", target.id);

  if (target.booking_id !== bookingId) {
    claimQuery = claimQuery
      .is("booking_id", null)
      .eq("status", "available");
  }

  const { data: claimedRows, error: claimError } = await claimQuery.select(
    "id,show_id,table_code,section,status,booking_id",
  );

  if (claimError) {
    throw claimError;
  }

  const claimedTable = (claimedRows?.[0] ?? null) as
    | ShowTableAssignmentRow
    | null;

  if (!claimedTable) {
    return Response.json(
      {
        error:
          "The selected table is no longer available. Refresh Floor and choose another table.",
      },
      { status: 409 },
    );
  }

  const { data: updatedBooking, error: bookingUpdateError } =
    await auth.serviceClient
      .from("bookings")
      .update({
        notes: serializeBookingNotes(booking),
        section: booking.zoneTitle,
        table_id: claimedTable.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", bookingId)
      .eq("show_id", showId)
      .select(bookingSelect)
      .maybeSingle();

  if (bookingUpdateError || !updatedBooking) {
    await auth.serviceClient
      .from("show_tables")
      .update({
        booking_id: target.booking_id,
        status: target.status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", target.id);

    if (bookingUpdateError) {
      throw bookingUpdateError;
    }

    return Response.json(
      { error: "The booking table assignment could not be saved." },
      { status: 409 },
    );
  }

  const priorClaims = (previousClaims ?? []) as ShowTableAssignmentRow[];
  const priorClaimIds = priorClaims
    .filter((table) => table.id !== claimedTable.id)
    .map((table) => table.id);

  if (priorClaimIds.length > 0) {
    const { error: releaseError } = await auth.serviceClient
      .from("show_tables")
      .update({
        booking_id: null,
        status: "available",
        updated_at: new Date().toISOString(),
      })
      .in("id", priorClaimIds)
      .eq("booking_id", bookingId);

    if (releaseError) {
      await auth.serviceClient
        .from("bookings")
        .update({
          notes: (beforeBooking as { notes: string | null }).notes,
          section: (beforeBooking as { section: string | null }).section,
          table_id: (beforeBooking as { table_id: string | null }).table_id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", bookingId);
      await auth.serviceClient
        .from("show_tables")
        .update({
          booking_id: target.booking_id,
          status: target.status,
          updated_at: new Date().toISOString(),
        })
        .eq("id", target.id);

      for (const priorClaim of priorClaims) {
        await auth.serviceClient
          .from("show_tables")
          .update({
            booking_id: priorClaim.booking_id,
            status: priorClaim.status,
            updated_at: new Date().toISOString(),
          })
          .eq("id", priorClaim.id);
      }

      throw releaseError;
    }
  }

  const diff = diffAuditFields(
    beforeBooking as Record<string, unknown>,
    updatedBooking as Record<string, unknown>,
    bookingAuditFields,
  );

  await tryRecordAuditEvent(
    auth.serviceClient,
    auth.staffProfile,
    auth.user,
    {
      action: "booking.table-assign",
      afterValues: diff.afterValues,
      beforeValues: diff.beforeValues,
      changedFields: diff.changedFields,
      entityId: bookingId,
      entityReference: booking.reference,
      entityType: "booking",
      outcome: "success",
      reason: `Assigned table ${claimedTable.table_code}.`,
      request,
      sourceArea: "Operations Floor",
    },
  );

  await notifyAppleWalletBooking(auth.serviceClient, bookingId);

  return Response.json({
    bookingId,
    bookingReference: booking.reference,
    showId,
    tableCode: claimedTable.table_code,
    tableId: claimedTable.id,
  });
}

async function persistPhysicalTableMapping(
  request: Request,
  bookingReference?: string,
  targetTableId?: string,
) {
  const auth = await requireActiveStaff(request);

  if (
    auth.error ||
    !auth.serviceClient ||
    !auth.staffProfile ||
    !auth.user
  ) {
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

  if (!bookingReference?.trim() || !targetTableId?.trim()) {
    return Response.json(
      { error: "A booking and physical table are required." },
      { status: 400 },
    );
  }

  const { data: booking, error: bookingError } = await auth.serviceClient
    .from("bookings")
    .select("id,booking_reference,show_id,table_id,section,guest_count,archived_at")
    .eq("booking_reference", bookingReference.trim())
    .maybeSingle();

  if (bookingError) {
    throw bookingError;
  }

  if (!booking || booking.archived_at) {
    return Response.json(
      { error: "The active booking could not be resolved." },
      { status: booking ? 409 : 404 },
    );
  }

  if (!booking.table_id) {
    return Response.json(
      { error: "The booking does not currently have a table to reallocate." },
      { status: 409 },
    );
  }

  const [
    { data: show, error: showError },
    { data: sourceTable, error: sourceTableError },
    { data: targetTable, error: tableError },
  ] = await Promise.all([
      auth.serviceClient
        .from("shows")
        .select("id,venue")
        .eq("id", booking.show_id)
        .maybeSingle(),
      auth.serviceClient
        .from("show_tables")
        .select("id,show_id,table_code,section,status,booking_id,is_physical,is_override,availability_scope,merged_from,merged_parent_id")
        .eq("id", booking.table_id)
        .maybeSingle(),
      auth.serviceClient
        .from("show_tables")
        .select("id,show_id,table_code,section,capacity,capacity_configured,status,booking_id,is_physical,is_override,availability_scope,merged_from,merged_parent_id")
        .eq("id", targetTableId.trim())
        .maybeSingle(),
    ]);

  if (showError) {
    throw showError;
  }

  if (tableError) {
    throw tableError;
  }

  if (sourceTableError) {
    throw sourceTableError;
  }

  const location = normalizeShowLocation(show?.venue);
  const venueScope = normalizeStaffVenueScope(auth.staffProfile.venue_scope ?? []);

  if (!location || (!venueScope.includes("all") && !venueScope.includes(location))) {
    return Response.json(
      { error: "This performance is outside your assigned location." },
      { status: 403 },
    );
  }

  const typedTargetTable = targetTable as ShowTableAssignmentRow | null;
  const targetMergedMemberIds = Array.from(
    new Set(typedTargetTable?.merged_from ?? []),
  );
  const targetIsPhysical =
    typedTargetTable?.is_physical === true &&
    targetMergedMemberIds.length === 0;
  const targetIsMergedCandidate = Boolean(
    typedTargetTable &&
      typedTargetTable.is_physical !== true &&
      typedTargetTable.is_override === true &&
      typedTargetTable.availability_scope === "operational" &&
      !typedTargetTable.merged_parent_id &&
      targetMergedMemberIds.length >= 2 &&
      targetMergedMemberIds.length ===
        (typedTargetTable.merged_from ?? []).length,
  );
  let targetIsValidMergedParent = false;

  if (typedTargetTable && targetIsMergedCandidate) {
    const { data: memberRows, error: memberError } = await auth.serviceClient
      .from("show_tables")
      .select("id,show_id,section,capacity,capacity_configured,status,booking_id,is_physical,merged_from,merged_parent_id")
      .in("id", targetMergedMemberIds);

    if (memberError) {
      throw memberError;
    }

    const typedMemberRows = (memberRows ?? []) as ShowTableAssignmentRow[];
    targetIsValidMergedParent =
      typedMemberRows.length === targetMergedMemberIds.length &&
      typedMemberRows.every(
        (member) =>
          member.show_id === typedTargetTable.show_id &&
          normalizeTableZone(member.section) ===
            normalizeTableZone(typedTargetTable.section) &&
          member.is_physical === true &&
          member.capacity_configured !== false &&
          member.capacity !== null &&
          member.status === "disabled" &&
          !member.booking_id &&
          member.merged_parent_id === typedTargetTable.id &&
          !(member.merged_from ?? []).length,
      ) &&
      typedMemberRows.reduce(
        (total, member) => total + Number(member.capacity ?? 0),
        0,
      ) === Number(typedTargetTable.capacity ?? 0);
  }

  if (
    !typedTargetTable ||
    typedTargetTable.show_id !== booking.show_id ||
    normalizeTableZone(typedTargetTable.section) !==
      normalizeTableZone(booking.section) ||
    (!targetIsPhysical && !targetIsValidMergedParent) ||
    !typedTargetTable.capacity_configured ||
    typedTargetTable.capacity === null ||
    Number(typedTargetTable.capacity) < booking.guest_count ||
    typedTargetTable.merged_parent_id ||
    typedTargetTable.status === "disabled" ||
    (typedTargetTable.id !== booking.table_id &&
      (typedTargetTable.status !== "available" || typedTargetTable.booking_id)) ||
    (typedTargetTable.id === booking.table_id &&
      typedTargetTable.booking_id !== booking.id)
  ) {
    return Response.json(
      { error: "The selected table is not available for this booking." },
      { status: 409 },
    );
  }

  const { data: mappingResult, error: mappingError } = await auth.serviceClient.rpc(
    "map_booking_physical_table_atomic",
    {
      p_booking_id: booking.id,
      p_expected_previous_table_id: booking.table_id,
      p_target_table_id: typedTargetTable.id,
    },
  );

  if (mappingError) {
    throw mappingError;
  }

  await tryRecordAuditEvent(
    auth.serviceClient,
    auth.staffProfile,
    auth.user,
    {
      afterValues: { table_id: typedTargetTable.id },
      beforeValues: { table_id: booking.table_id },
      changedFields: ["table_id"],
      entityId: booking.id,
      entityReference: booking.booking_reference,
      entityType: "booking",
      outcome: "success",
      action:
        (sourceTable as ShowTableAssignmentRow | null)?.is_physical === true ||
        ((sourceTable as ShowTableAssignmentRow | null)?.merged_from?.length ?? 0) >= 2
          ? "booking.physical_table_reallocated"
          : "booking.physical_table_map",
      reason:
        (sourceTable as ShowTableAssignmentRow | null)?.is_physical === true ||
        ((sourceTable as ShowTableAssignmentRow | null)?.merged_from?.length ?? 0) >= 2
          ? `Reallocated table ${(sourceTable as ShowTableAssignmentRow).table_code} to ${typedTargetTable.table_code}.`
          : `Mapped legacy assignment to operational table ${typedTargetTable.table_code}.`,
      request,
      sourceArea: "Operations Floor",
    },
  );

  if (booking.table_id !== typedTargetTable.id) {
    await notifyAppleWalletBooking(auth.serviceClient, booking.id);
  }

  return Response.json({
    bookingId: booking.id,
    bookingReference: booking.booking_reference,
    mapping: mappingResult,
    showId: booking.show_id,
    tableCode: typedTargetTable.table_code,
    tableId: typedTargetTable.id,
  });
}

async function runBookingTransaction(request: Request, body?: unknown) {
  const rawRequestBody = body ?? (await request.json());
  const rawBooking =
    typeof rawRequestBody === "object" && rawRequestBody && "booking" in rawRequestBody
      ? (rawRequestBody as { booking?: DemoBooking }).booking
      : undefined;
  const requestBody = rawBooking
    ? {
        ...(rawRequestBody as Record<string, unknown>),
        booking: {
          ...rawBooking,
          source: enforceCorporateBookingSource(
            rawBooking.partySize,
            rawBooking.source,
          ),
        },
      }
    : rawRequestBody;
  const bookingReference =
    typeof requestBody === "object" &&
    requestBody &&
    "booking" in requestBody &&
    typeof (requestBody as { booking?: { reference?: unknown } }).booking
      ?.reference === "string"
      ? (requestBody as { booking: { reference: string } }).booking.reference
      : undefined;
  const supabase = getRouteClient();
  const actor = await getAuditActor(request);
  const { data: beforeBooking } =
    supabase && bookingReference
      ? await supabase
          .from("bookings")
          .select(bookingSelect)
          .eq("booking_reference", bookingReference)
          .maybeSingle()
      : { data: null };

  if (
    supabase &&
    beforeBooking &&
    (beforeBooking as { archived_at?: string | null }).archived_at
  ) {
    await tryRecordAuditEvent(supabase, actor.staffProfile, actor.user, {
      action: "booking.edit",
      beforeValues: pickAuditFields(beforeBooking as Record<string, unknown>, [
        "booking_reference",
        "archived_at",
        "archive_reason",
      ]),
      entityId: (beforeBooking as { id?: string }).id ?? null,
      entityReference: bookingReference ?? "unknown-booking",
      entityType: "booking",
      outcome: "blocked",
      reason: "Archived bookings must be restored before editing.",
      request,
      sourceArea: "Bookings",
    });

    return Response.json(
      { error: "Archived bookings must be restored before editing." },
      { status: 409 },
    );
  }

  const response = await fetch(new URL("/api/bookings", request.url), {
    body: JSON.stringify(requestBody),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  const payload = await response.json().catch(() => ({}));

  if (supabase && bookingReference) {
    const { data: afterBooking } = await supabase
      .from("bookings")
      .select(bookingSelect)
      .eq("booking_reference", bookingReference)
      .maybeSingle();
    const diff = diffAuditFields(
      beforeBooking as Record<string, unknown> | null,
      afterBooking as Record<string, unknown> | null,
      bookingAuditFields,
    );
    const action = beforeBooking ? "booking.edit" : "booking.create";

    if (response.ok) {
      try {
        await recordAuditEvent(supabase, actor.staffProfile, actor.user, {
          action,
          afterValues:
            diff.changedFields.length > 0
              ? diff.afterValues
              : pickAuditFields(afterBooking as Record<string, unknown>, [
                  "booking_reference",
                  "booking_status",
                  "payment_status",
                ]),
          beforeValues: diff.beforeValues,
          changedFields:
            diff.changedFields.length > 0
              ? diff.changedFields
              : ["booking_reference"],
          entityId:
            ((afterBooking ?? beforeBooking) as { id?: string } | null)?.id ??
            null,
          entityReference: bookingReference,
          entityType: "booking",
          outcome: "success",
          request,
          sourceArea: "Bookings",
        });

        const bookingId = (afterBooking as { id?: string } | null)?.id;
        const walletFields = new Set([
          "booking_status",
          "payment_status",
          "section",
          "show_id",
          "table_id",
        ]);

        if (
          bookingId &&
          diff.changedFields.some((field) => walletFields.has(field))
        ) {
          await notifyAppleWalletBooking(supabase, bookingId);
        }
      } catch {
        return Response.json(
          {
            ...payload,
            auditError:
              "Booking was saved, but the audit event could not be recorded.",
          },
          { status: 500 },
        );
      }
    } else {
      await tryRecordAuditEvent(supabase, actor.staffProfile, actor.user, {
        action,
        beforeValues: pickAuditFields(beforeBooking as Record<string, unknown>, [
          "booking_reference",
          "booking_status",
          "payment_status",
        ]),
        entityReference: bookingReference,
        entityType: "booking",
        outcome: "failed",
        reason:
          typeof payload?.error === "string"
            ? payload.error
            : "Booking save request failed.",
        request,
        sourceArea: "Bookings",
      });
    }
  }

  return Response.json(payload, { status: response.status });
}

async function persistBookingCancellation(request: Request) {
  const supabase = getRouteClient();

  if (!supabase) {
    return Response.json(
      { error: "Supabase service role is not configured." },
      { status: 500 },
    );
  }

  try {
    const body = (await request.json()) as {
      booking?: DemoBooking;
    };
    const booking = body.booking;

    if (!booking?.reference || booking.status !== "cancelled") {
      return Response.json(
        { error: "A cancelled booking payload is required." },
        { status: 400 },
      );
    }

    const { data: bookingRows, error: loadError } = await supabase
      .from("bookings")
      .select("id,payment_status,archived_at")
      .eq("booking_reference", booking.reference)
      .limit(1);

    if (loadError) {
      throw loadError;
    }

    const existingBooking = bookingRows?.[0] as
      | { archived_at?: string | null; id?: string; payment_status?: string }
      | undefined;

    if (!existingBooking?.id) {
      return Response.json(
        { error: "Booking could not be resolved for cancellation." },
        { status: 404 },
      );
    }

    if (existingBooking.archived_at) {
      const actor = await getAuditActor(request);

      await tryRecordAuditEvent(supabase, actor.staffProfile, actor.user, {
        action: "booking.cancel",
        entityId: existingBooking.id,
        entityReference: booking.reference,
        entityType: "booking",
        outcome: "blocked",
        reason: "Archived bookings must be restored before cancellation.",
        request,
        sourceArea: "Bookings",
      });

      return Response.json(
        {
          error: "Archived bookings must be restored before cancellation.",
        },
        { status: 409 },
      );
    }

    const { data: beforeBooking, error: beforeError } = await supabase
      .from("bookings")
      .select(bookingSelect)
      .eq("id", existingBooking.id)
      .maybeSingle();

    if (beforeError) {
      throw beforeError;
    }

    if (
      ((beforeBooking as { booking_status?: string } | null)
        ?.booking_status ?? "") === "cancelled"
    ) {
      return Response.json({ idempotent: true, row: beforeBooking });
    }

    const { data: updatedBooking, error: updateError } = await supabase
      .from("bookings")
      .update({
        booking_status: "cancelled",
        notes: serializeBookingNotes(booking),
      })
      .eq("id", existingBooking.id)
      .select(bookingSelect)
      .maybeSingle();

    if (updateError) {
      throw updateError;
    }

    await releaseTableClaimsForBookings(supabase, [existingBooking.id]);

    const latestCancellationEvent = booking.lifecycleHistory?.find(
      (event) => event.toStatus === "cancelled",
    );

    if (latestCancellationEvent) {
      const payload = toLifecyclePayload(
        latestCancellationEvent,
        existingBooking.id,
      );
      let existingEventQuery = supabase
        .from("booking_lifecycle_events")
        .select("id")
        .eq("booking_id", existingBooking.id)
        .eq("note", payload.note)
        .eq("to_status", payload.to_status)
        .limit(1);

      existingEventQuery = payload.from_status
        ? existingEventQuery.eq("from_status", payload.from_status)
        : existingEventQuery.is("from_status", null);

      const { data: existingEvents, error: eventLoadError } =
        await existingEventQuery;

      if (eventLoadError) {
        throw eventLoadError;
      }

      if (!existingEvents?.length) {
        const { error: eventInsertError } = await supabase
          .from("booking_lifecycle_events")
          .insert(payload);

        if (eventInsertError) {
          throw eventInsertError;
        }
      }
    }

    const actor = await getAuditActor(request);
    const diff = diffAuditFields(
      beforeBooking as Record<string, unknown>,
      updatedBooking as Record<string, unknown>,
      bookingAuditFields,
    );

    try {
      await recordAuditEvent(supabase, actor.staffProfile, actor.user, {
        action: "booking.cancel",
        afterValues: diff.afterValues,
        beforeValues: diff.beforeValues,
        changedFields: diff.changedFields,
        entityId: existingBooking.id,
        entityReference: booking.reference,
        entityType: "booking",
        outcome: "success",
        reason: latestCancellationEvent?.note ?? "Booking cancelled.",
        request,
        sourceArea: "Bookings",
      });

      await notifyAppleWalletBooking(supabase, existingBooking.id);
    } catch {
      return Response.json(
        {
          auditError:
            "Booking was cancelled, but the audit event could not be recorded.",
          row: updatedBooking,
        },
        { status: 500 },
      );
    }

    return Response.json({ row: updatedBooking });
  } catch (error) {
    console.error("[Zingara API] Failed to persist booking cancellation", error);

    return Response.json(
      { error: "Booking cancellation could not be saved." },
      { status: 500 },
    );
  }
}

async function persistBookingStateUpdate(request: Request, body: {
  booking?: DemoBooking;
}) {
  const supabase = getRouteClient();

  if (!supabase) {
    return Response.json(
      { error: "Supabase service role is not configured." },
      { status: 500 },
    );
  }

  try {
    const booking = body.booking;

    if (!booking?.reference) {
      return Response.json(
        { error: "A booking payload is required." },
        { status: 400 },
      );
    }

    const lockError = await ensureNoConflictingBookingLock(
      request,
      booking.reference,
    );

    if (lockError) {
      return lockError;
    }

    const { data: beforeBooking, error: beforeError } = await supabase
      .from("bookings")
      .select(bookingSelect)
      .eq("booking_reference", booking.reference)
      .maybeSingle();

    if (beforeError) {
      throw beforeError;
    }

    if (!beforeBooking) {
      return Response.json(
        { error: "Booking could not be resolved." },
        { status: 404 },
      );
    }

    const beforeStatus = (beforeBooking as { booking_status?: string })
      .booking_status;
    const beforePaymentStatus = (
      beforeBooking as { payment_status?: string }
    ).payment_status;

    if (
      (toSupabaseBookingStatus(booking.status) === "refunded" ||
        toSupabasePaymentStatus(booking.paymentStatus) === "refunded") &&
      beforeStatus !== "refunded" &&
      beforePaymentStatus !== "refunded"
    ) {
      return Response.json(
        {
          error:
            "Use Refund Booking so provider eligibility and refund history are verified.",
        },
        { status: 409 },
      );
    }

    if ((beforeBooking as { archived_at?: string | null }).archived_at) {
      const actor = await getAuditActor(request);

      await tryRecordAuditEvent(supabase, actor.staffProfile, actor.user, {
        action: "booking.edit",
        entityId: (beforeBooking as { id?: string }).id ?? null,
        entityReference: booking.reference,
        entityType: "booking",
        outcome: "blocked",
        reason: "Archived bookings must be restored before editing.",
        request,
        sourceArea: "Bookings",
      });

      return Response.json(
        { error: "Archived bookings must be restored before editing." },
        { status: 409 },
      );
    }

    const bookingId = (beforeBooking as { id: string }).id;
    const bookingSource = enforceCorporateBookingSource(
      booking.partySize,
      booking.source,
    );
    const classifiedBooking = { ...booking, source: bookingSource };
    const { data: updatedBooking, error: updateError } = await supabase
      .from("bookings")
      .update({
        amount_paid: booking.amountPaid ?? 0,
        balance_outstanding: booking.balanceDue ?? 0,
        booking_source: bookingSource,
        booking_status: toSupabaseBookingStatus(booking.status),
        notes: serializeBookingNotes(classifiedBooking),
        payment_status: toSupabasePaymentStatus(booking.paymentStatus),
      })
      .eq("id", bookingId)
      .select(bookingSelect)
      .maybeSingle();

    if (updateError) {
      throw updateError;
    }

    if (
      toSupabaseBookingStatus(booking.status) === "refunded" ||
      toSupabasePaymentStatus(booking.paymentStatus) === "refunded"
    ) {
      await releaseTableClaimsForBookings(supabase, [bookingId]);
    }

    for (const event of booking.lifecycleHistory ?? []) {
      const payload = toLifecyclePayload(event, bookingId);
      let existingEventQuery = supabase
        .from("booking_lifecycle_events")
        .select("id")
        .eq("booking_id", bookingId)
        .eq("note", payload.note)
        .eq("to_status", payload.to_status)
        .limit(1);

      existingEventQuery = payload.from_status
        ? existingEventQuery.eq("from_status", payload.from_status)
        : existingEventQuery.is("from_status", null);

      const { data: existingEvents, error: eventLoadError } =
        await existingEventQuery;

      if (eventLoadError) {
        throw eventLoadError;
      }

      if (!existingEvents?.length) {
        const { error: eventInsertError } = await supabase
          .from("booking_lifecycle_events")
          .insert(payload);

        if (eventInsertError) {
          throw eventInsertError;
        }
      }
    }

    const actor = await getAuditActor(request);
    const diff = diffAuditFields(
      beforeBooking as Record<string, unknown>,
      updatedBooking as Record<string, unknown>,
      bookingAuditFields,
    );

    await recordAuditEvent(supabase, actor.staffProfile, actor.user, {
      action: "booking.edit",
      afterValues: diff.afterValues,
      beforeValues: diff.beforeValues,
      changedFields: diff.changedFields,
      entityId: bookingId,
      entityReference: booking.reference,
      entityType: "booking",
      outcome: "success",
      request,
      sourceArea: "Bookings",
    });

    const walletFields = new Set([
      "booking_status",
      "payment_status",
      "section",
      "show_id",
      "table_id",
    ]);

    if (diff.changedFields.some((field) => walletFields.has(field))) {
      await notifyAppleWalletBooking(supabase, bookingId);
    }

    return Response.json({ row: updatedBooking });
  } catch (error) {
    console.error("[Zingara API] Failed to persist booking state update", error);

    return Response.json(
      { error: "Booking update could not be saved." },
      { status: 500 },
    );
  }
}

async function setBookingArchiveState(
  request: Request,
  options: {
    archive: boolean;
    reason?: string;
    references: string[];
  },
) {
  const auth = await requireActiveStaff(request);

  if (auth.error || !auth.serviceClient || !auth.staffProfile || !auth.user) {
    return auth.error;
  }

  const role = Array.isArray(auth.staffProfile.roles)
    ? auth.staffProfile.roles[0]
    : auth.staffProfile.roles;

  if (role?.name?.trim().toLowerCase() !== "super admin") {
    await tryRecordAuditEvent(auth.serviceClient, auth.staffProfile, auth.user, {
      action: options.archive ? "booking.archive" : "booking.restore",
      entityReference: options.references[0] ?? "unknown-booking",
      entityType: "booking",
      outcome: "blocked",
      reason: "Super Admin access is required.",
      request,
      sourceArea: "Bookings",
    });

    return Response.json(
      { error: "Super Admin access is required." },
      { status: 403 },
    );
  }

  const references = [...new Set(options.references.map((reference) => reference.trim()).filter(Boolean))];

  if (references.length === 0) {
    return Response.json(
      { error: "At least one booking reference is required." },
      { status: 400 },
    );
  }

  const { data: beforeRows, error: loadError } = await auth.serviceClient
    .from("bookings")
    .select(bookingSelect)
    .in("booking_reference", references);

  if (loadError) {
    throw loadError;
  }

  const rowsToChange = (beforeRows ?? []).filter((row) =>
    options.archive ? !row.archived_at : Boolean(row.archived_at),
  );

  if (rowsToChange.length === 0) {
    return Response.json({
      archived: 0,
      restored: 0,
      skipped: references.length,
    });
  }

  const updatePayload = options.archive
    ? {
        archive_reason: options.reason?.trim() || "Archived by Super Admin.",
        archived_at: new Date().toISOString(),
        archived_by: auth.user.id,
        updated_at: new Date().toISOString(),
      }
    : {
        archive_reason: null,
        archived_at: null,
        archived_by: null,
        updated_at: new Date().toISOString(),
      };

  const { data: afterRows, error: updateError } = await auth.serviceClient
    .from("bookings")
    .update(updatePayload)
    .in(
      "booking_reference",
      rowsToChange.map((row) => row.booking_reference),
    )
    .select(bookingSelect);

  if (updateError) {
    throw updateError;
  }

  if (options.archive) {
    await releaseTableClaimsForBookings(
      auth.serviceClient,
      rowsToChange.map((row) => row.id),
    );
  }

  try {
    const afterRowsByReference = new Map(
      (afterRows ?? []).map((row) => [row.booking_reference, row]),
    );

    for (const beforeRow of rowsToChange) {
      const afterRow = afterRowsByReference.get(beforeRow.booking_reference);
      const diff = diffAuditFields(
        beforeRow as Record<string, unknown>,
        afterRow as Record<string, unknown>,
        bookingAuditFields,
      );

      await recordAuditEvent(auth.serviceClient, auth.staffProfile, auth.user, {
        action: options.archive ? "booking.archive" : "booking.restore",
        afterValues: diff.afterValues,
        beforeValues: diff.beforeValues,
        changedFields: diff.changedFields,
        entityId: beforeRow.id,
        entityReference: beforeRow.booking_reference,
        entityType: "booking",
        outcome: "success",
        reason: options.reason ?? (options.archive ? "Booking archived." : "Booking restored."),
        request,
        sourceArea: "Bookings",
      });
    }
  } catch (auditError) {
    if (options.archive) {
      await auth.serviceClient
        .from("bookings")
        .update({
          archive_reason: null,
          archived_at: null,
          archived_by: null,
          updated_at: new Date().toISOString(),
        })
        .in(
          "booking_reference",
          rowsToChange.map((row) => row.booking_reference),
        );
    } else {
      for (const beforeRow of rowsToChange) {
        await auth.serviceClient
          .from("bookings")
          .update({
            archive_reason: beforeRow.archive_reason,
            archived_at: beforeRow.archived_at,
            archived_by: beforeRow.archived_by,
            updated_at: new Date().toISOString(),
          })
          .eq("booking_reference", beforeRow.booking_reference);
      }
    }

    console.error("[Zingara API] Booking archive audit failed", auditError);

    return Response.json(
      {
        auditError: "Booking archive audit could not be recorded.",
      },
      { status: 500 },
    );
  }

  return Response.json({
    archived: options.archive ? rowsToChange.length : 0,
    restored: options.archive ? 0 : rowsToChange.length,
    skipped: references.length - rowsToChange.length,
  });
}

export async function POST(request: Request) {
  return runBookingTransaction(request);
}

export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    booking?: DemoBooking;
    bookingReference?: string;
    targetTableId?: string;
  };
  const lockError = await ensureNoConflictingBookingLock(
    request,
    body.booking?.reference ?? body.bookingReference,
  );

  if (lockError) {
    return lockError;
  }

  if (body.action === "assign-table") {
    try {
      return await persistBookingTableAssignment(request, body.booking);
    } catch (error) {
      console.error("[Zingara API] Failed to assign booking table", error);

      return Response.json(
        { error: "The booking table assignment could not be saved." },
        { status: 500 },
      );
    }
  }

  if (body.action === "map-physical-table") {
    try {
      return await persistPhysicalTableMapping(
        request,
        body.bookingReference,
        body.targetTableId,
      );
    } catch (error) {
      const message =
        typeof error === "object" && error && "message" in error
          ? String((error as { message?: unknown }).message ?? "")
          : "";

      if (
        message.includes("BOOKING_TABLE_ASSIGNMENT_CHANGED") ||
        message.includes("LEGACY_TABLE_ASSIGNMENT_REQUIRED") ||
        message.includes("SOURCE_TABLE_ASSIGNMENT_REQUIRED") ||
        message.includes("SOURCE_TABLE_NOT_REALLOCATABLE") ||
        message.includes("PHYSICAL_TABLE_NOT_AVAILABLE")
      ) {
        return Response.json(
          {
            error:
              "The booking or physical table changed before the mapping could be saved. Refresh and retry.",
          },
          { status: 409 },
        );
      }

      console.error("[Zingara API] Failed to map physical booking table", error);

      return Response.json(
        { error: "The physical table mapping could not be saved." },
        { status: 500 },
      );
    }
  }

  if (body.action === "cancel") {
    return persistBookingCancellation(
      new Request(request.url, {
        body: JSON.stringify(body),
        headers: request.headers,
        method: request.method,
      }),
    );
  }

  if (body.action === "update-state") {
    return persistBookingStateUpdate(request, body);
  }

  if (body.action === "archive" || body.action === "restore") {
    const archiveBody = body as {
      action: "archive" | "restore";
      reason?: string;
      references?: string[];
    };

    return setBookingArchiveState(request, {
      archive: archiveBody.action === "archive",
      reason: archiveBody.reason,
      references: archiveBody.references ?? [],
    });
  }

  return runBookingTransaction(request, body);
}

export async function DELETE(request: Request) {
  const supabase = getRouteClient();

  if (!supabase) {
    return Response.json(
      { error: "Supabase service role is not configured." },
      { status: 500 },
    );
  }

  const url = new URL(request.url);
  const body = (await request.json().catch(() => ({}))) as {
    reference?: string;
  };
  const reference = body.reference ?? url.searchParams.get("reference");

  if (!reference) {
    return Response.json(
      { error: "Booking reference is required." },
      { status: 400 },
    );
  }

  const lockError = await ensureNoConflictingBookingLock(request, reference);

  if (lockError) {
    return lockError;
  }

  const { data: beforeBooking } = await supabase
    .from("bookings")
    .select(bookingSelect)
    .eq("booking_reference", reference)
    .maybeSingle();

  const { error } = await supabase
    .from("bookings")
    .delete()
    .eq("booking_reference", reference);

  if (error) {
    console.error("[Zingara API] Failed to delete booking", error);

    return Response.json(
      { error: "Booking could not be deleted." },
      { status: 500 },
    );
  }

  const actor = await getAuditActor(request);
  await tryRecordAuditEvent(supabase, actor.staffProfile, actor.user, {
    action: "booking.delete",
    beforeValues: pickAuditFields(beforeBooking as Record<string, unknown>, [
      "booking_reference",
      "booking_status",
      "payment_status",
      "guest_count",
    ]),
    entityId: (beforeBooking as { id?: string } | null)?.id ?? null,
    entityReference: reference,
    entityType: "booking",
    outcome: "success",
    reason: "Booking deleted through admin API.",
    request,
    sourceArea: "Bookings",
  });

  return Response.json({ ok: true });
}
