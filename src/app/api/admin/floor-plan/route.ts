import { createHash } from "node:crypto";

import {
  buildInitialFloorPlan,
  type FloorAllocatorBooking,
  type FloorAllocatorTable,
  type FloorAllocatorZone,
} from "@/lib/floorAllocator";
import { normalizeStaffVenueScope } from "@/lib/staffLocations";
import {
  getRolePermissions,
  requireActiveStaff,
} from "@/lib/supabase/serverAdmin";
import {
  normalizeShowLocation,
  venueZoneSeatCapacities,
} from "@/lib/zingaraDemo";

export const dynamic = "force-dynamic";

type ShowRow = {
  date: string;
  id: string;
  notes: string | null;
  status: string;
  time: string;
  updated_at: string;
  venue: string | null;
};

type BookingRow = {
  booking_reference: string;
  guest_count: number;
  id: string;
  section: string | null;
  show_id: string;
  table_id: string | null;
  updated_at: string;
};

type ShowTableRow = {
  availability_scope: string;
  booking_id: string | null;
  capacity: number | null;
  capacity_configured: boolean;
  id: string;
  is_override: boolean;
  is_physical: boolean;
  merged_from: string[] | null;
  merged_parent_id: string | null;
  section: string;
  show_id: string;
  status: string;
  table_code: string;
  updated_at: string;
  venue_table_id: string | null;
};

type VenueTableRow = {
  id: string;
  is_physical: boolean;
  maximum_capacity: number | null;
  mergeable: boolean;
  minimum_capacity: number | null;
};

const showMetadataPrefix = "__zingara_show_meta__:";

function getLegacyShowId(notes: string | null) {
  if (!notes?.startsWith(showMetadataPrefix)) {
    return "";
  }

  try {
    return (
      (JSON.parse(notes.slice(showMetadataPrefix.length)) as {
        legacyId?: string;
      }).legacyId ?? ""
    );
  } catch {
    return "";
  }
}

function normalizeZone(value: string | null): FloorAllocatorZone | null {
  const normalized = value?.trim().toLowerCase() ?? "";

  if (["golden circle", "golden-circle"].includes(normalized)) {
    return "golden-circle";
  }

  if (["middle ring", "middle-ring"].includes(normalized)) {
    return "middle-ring";
  }

  if (
    [
      "private booth",
      "private booths",
      "royal booth",
      "royal booths",
      "royal-booths",
      "booth",
      "booths",
    ].includes(normalized)
  ) {
    return "royal-booths";
  }

  if (["royal balcony", "royal-balcony"].includes(normalized)) {
    return "royal-balcony";
  }

  return null;
}

function getStaffPermissions(
  profile: NonNullable<
    Awaited<ReturnType<typeof requireActiveStaff>>["staffProfile"]
  >,
) {
  const role = Array.isArray(profile.roles) ? profile.roles[0] : profile.roles;
  return getRolePermissions(role);
}

function canAccessShow(
  profile: { venue_scope: string[] },
  show: ShowRow,
) {
  const location = normalizeShowLocation(show.venue);
  const scope = normalizeStaffVenueScope(profile.venue_scope ?? []);
  return Boolean(location && (scope.includes("all") || scope.includes(location)));
}

async function loadAuthoritativeFloorPlan(
  serviceClient: NonNullable<
    Awaited<ReturnType<typeof requireActiveStaff>>["serviceClient"]
  >,
  showReference: string,
) {
  const { data: showRows, error: showError } = await serviceClient
    .from("shows")
    .select("id,date,time,venue,status,notes,updated_at");

  if (showError) {
    throw showError;
  }

  const show = ((showRows ?? []) as ShowRow[]).find(
    (candidate) =>
      candidate.id === showReference ||
      getLegacyShowId(candidate.notes) === showReference,
  );

  if (!show) {
    return null;
  }

  const [bookingResult, tableResult, venueTableResult] = await Promise.all([
    serviceClient
      .from("bookings")
      .select("id,booking_reference,show_id,table_id,section,guest_count,updated_at")
      .eq("show_id", show.id)
      .eq("booking_status", "confirmed")
      .is("archived_at", null),
    serviceClient
      .from("show_tables")
      .select("id,show_id,venue_table_id,table_code,section,capacity,capacity_configured,status,booking_id,is_physical,is_override,availability_scope,merged_from,merged_parent_id,updated_at")
      .eq("show_id", show.id),
    serviceClient
      .from("venue_tables")
      .select("id,is_physical,minimum_capacity,maximum_capacity,mergeable"),
  ]);

  if (bookingResult.error) {
    throw bookingResult.error;
  }

  if (tableResult.error) {
    throw tableResult.error;
  }

  if (venueTableResult.error) {
    throw venueTableResult.error;
  }

  const bookingRows = (bookingResult.data ?? []) as BookingRow[];
  const tableRows = (tableResult.data ?? []) as ShowTableRow[];
  const venueTablesById = new Map(
    ((venueTableResult.data ?? []) as VenueTableRow[]).map((table) => [
      table.id,
      table,
    ]),
  );
  const snapshotToken = createHash("sha256")
    .update(
      JSON.stringify({
        bookings: [...bookingRows].sort((left, right) =>
          left.id.localeCompare(right.id),
        ),
        show: {
          id: show.id,
          status: show.status,
          updated_at: show.updated_at,
        },
        tables: [...tableRows].sort((left, right) =>
          left.id.localeCompare(right.id),
        ),
      }),
    )
    .digest("hex");
  const invalidZoneBookings = bookingRows.filter(
    (booking) => !normalizeZone(booking.section),
  );
  const bookings = bookingRows.flatMap((booking) => {
    const zone = normalizeZone(booking.section);

    return zone
      ? [
          {
            id: booking.id,
            pax: booking.guest_count,
            reference: booking.booking_reference,
            showId: booking.show_id,
            tableId: booking.table_id,
            updatedAt: booking.updated_at,
            zone,
          } satisfies FloorAllocatorBooking,
        ]
      : [];
  });
  const tables = tableRows.flatMap((table) => {
    const zone = normalizeZone(table.section);

    if (!zone) {
      return [];
    }

    const venueTable = table.venue_table_id
      ? venueTablesById.get(table.venue_table_id)
      : undefined;

    return [
      {
        availabilityScope: table.availability_scope,
        bookingId: table.booking_id,
        capacity: table.capacity,
        capacityConfigured: table.capacity_configured,
        id: table.id,
        isOverride: table.is_override,
        isPhysical: table.is_physical,
        maximumCapacity: venueTable?.maximum_capacity ?? table.capacity,
        mergeable: venueTable?.mergeable === true,
        mergedFrom: table.merged_from ?? [],
        mergedParentId: table.merged_parent_id,
        minimumCapacity: venueTable?.minimum_capacity ?? table.capacity,
        showId: table.show_id,
        status: table.status,
        tableCode: table.table_code,
        updatedAt: table.updated_at,
        zone,
      } satisfies FloorAllocatorTable,
    ];
  });
  const plan = buildInitialFloorPlan({
    bookings,
    showId: show.id,
    snapshotToken,
    tables,
    zoneCeilings: {
      "golden-circle": venueZoneSeatCapacities["golden-circle"],
      "middle-ring": venueZoneSeatCapacities["middle-ring"],
      "royal-balcony": venueZoneSeatCapacities["royal-balcony"],
      "royal-booths": venueZoneSeatCapacities["royal-booths"],
    },
  });

  for (const booking of invalidZoneBookings) {
    plan.unresolved.push({
      bookingReference: booking.booking_reference,
      currentAssignment: booking.table_id ? "Invalid table assignment" : "Unallocated",
      pax: booking.guest_count,
      reason: "The booking does not have a valid authoritative seating zone.",
      zone: null,
    });
  }

  plan.summary.unresolvedBookings += invalidZoneBookings.length;
  plan.summary.unresolvedExceptions += invalidZoneBookings.length;

  return { plan, show };
}

async function authorize(request: Request) {
  const auth = await requireActiveStaff(request);

  if (auth.error || !auth.serviceClient || !auth.staffProfile || !auth.user) {
    return { auth, error: auth.error };
  }

  const permissions = getStaffPermissions(auth.staffProfile);

  if (
    !permissions.includes("bookings:manage") ||
    !permissions.includes("tables:manage")
  ) {
    return {
      auth,
      error: Response.json(
        { error: "Booking and table management access is required." },
        { status: 403 },
      ),
    };
  }

  return { auth, error: null };
}

export async function GET(request: Request) {
  const { auth, error } = await authorize(request);

  if (error) {
    return error;
  }

  if (!auth.serviceClient || !auth.staffProfile) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  const showReference = new URL(request.url).searchParams
    .get("showReference")
    ?.trim();

  if (!showReference) {
    return Response.json(
      { error: "Select one performance before planning its floor." },
      { status: 400 },
    );
  }

  try {
    const result = await loadAuthoritativeFloorPlan(
      auth.serviceClient,
      showReference,
    );

    if (!result) {
      return Response.json({ error: "Performance not found." }, { status: 404 });
    }

    if (result.show.status !== "active") {
      return Response.json(
        { error: "Only active performances can receive an initial floor plan." },
        { status: 409 },
      );
    }

    if (!canAccessShow(auth.staffProfile, result.show)) {
      return Response.json(
        { error: "This performance is outside your assigned location." },
        { status: 403 },
      );
    }

    return Response.json({
      plan: result.plan,
      show: {
        date: result.show.date,
        id: result.show.id,
        time: result.show.time,
        venue: result.show.venue,
      },
    });
  } catch (loadError) {
    console.error("[Zingara Floor Plan] Dry run failed", loadError);
    return Response.json(
      { error: "The authoritative floor snapshot could not be planned." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const { auth, error } = await authorize(request);

  if (error) {
    return error;
  }

  if (!auth.serviceClient || !auth.staffProfile || !auth.user) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    confirmApply?: boolean;
    showReference?: string;
    snapshotToken?: string;
  };

  if (
    body.confirmApply !== true ||
    !body.showReference?.trim() ||
    !body.snapshotToken?.trim()
  ) {
    return Response.json(
      { error: "Review the current dry run before applying the initial floor." },
      { status: 400 },
    );
  }

  try {
    const result = await loadAuthoritativeFloorPlan(
      auth.serviceClient,
      body.showReference.trim(),
    );

    if (!result) {
      return Response.json({ error: "Performance not found." }, { status: 404 });
    }

    if (
      result.show.status !== "active" ||
      !canAccessShow(auth.staffProfile, result.show)
    ) {
      return Response.json(
        { error: "This performance cannot be changed by the current staff member." },
        { status: 403 },
      );
    }

    if (result.plan.snapshotToken !== body.snapshotToken.trim()) {
      return Response.json(
        {
          error:
            "The performance changed after this plan was generated. Run a fresh dry run.",
        },
        { status: 409 },
      );
    }

    const { data, error: applyError } = await auth.serviceClient.rpc(
      "apply_initial_floor_plan_atomic",
      {
        p_actor_auth_user_id: auth.user.id,
        p_actor_location_scope: auth.staffProfile.venue_scope ?? [],
        p_actor_name: auth.staffProfile.full_name ?? auth.user.email,
        p_actor_role: Array.isArray(auth.staffProfile.roles)
          ? auth.staffProfile.roles[0]?.name ?? "staff"
          : auth.staffProfile.roles?.name ?? "staff",
        p_actor_staff_profile_id: auth.staffProfile.id,
        p_plan: result.plan as unknown as Record<string, unknown>,
        p_show_id: result.show.id,
        p_snapshot_token: result.plan.snapshotToken,
      },
    );

    if (applyError) {
      if (
        applyError.message.includes("FLOOR_PLAN_STALE") ||
        applyError.message.includes("FLOOR_PLAN_INVALID")
      ) {
        return Response.json(
          { error: "The floor changed before Apply. Run a fresh dry run." },
          { status: 409 },
        );
      }

      throw applyError;
    }

    return Response.json({ ok: true, result: data });
  } catch (applyError) {
    console.error("[Zingara Floor Plan] Apply failed", applyError);
    return Response.json(
      { error: "The initial floor was not applied. No partial plan was retained." },
      { status: 500 },
    );
  }
}
