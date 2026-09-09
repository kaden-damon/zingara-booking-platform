import { createHash } from "node:crypto";

import {
  buildZoneFloorCapacityPlan,
  corporateFloorZones,
  type CorporateFloorZone,
  type FloorPlanningTable,
} from "@/lib/corporateFloorPlanning";
import { physicalTableDefinitions } from "@/lib/physicalTables";
import { normalizeStaffVenueScope } from "@/lib/staffLocations";
import {
  getRolePermissions,
  requireActiveStaff,
} from "@/lib/supabase/serverAdmin";
import {
  defaultVenueSettings,
  getConfiguredZoneMaxSeats,
  getZoneById,
  normalizeShowLocation,
  normalizeVenueSettings,
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
  booking_origin: string | null;
  booking_reference: string;
  booking_source: string;
  booking_status: string;
  guest_count: number;
  id: string;
  section: string | null;
  table_id: string | null;
  updated_at: string;
  zone_entitlements: Array<{ pax: number; zoneId: string }> | null;
};

type TableRow = {
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
  status: string;
  table_code: string;
  updated_at: string;
};

const showMetadataPrefix = "__zingara_show_meta__:";
const activeEntitlementStatuses = new Set([
  "checked_in",
  "confirmed",
  "new",
  "pending_payment",
]);

function getLegacyShowId(notes: string | null) {
  if (!notes?.startsWith(showMetadataPrefix)) return "";

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

function normalizeZone(section: string | null): CorporateFloorZone | null {
  const normalized = section?.trim().toLowerCase() ?? "";
  if (["golden circle", "golden-circle"].includes(normalized)) {
    return "golden-circle";
  }
  if (["middle ring", "middle-ring"].includes(normalized)) {
    return "middle-ring";
  }
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
  if (["royal balcony", "royal-balcony"].includes(normalized)) {
    return "royal-balcony";
  }
  return null;
}

function canAccessShow(profile: { venue_scope: string[] }, show: ShowRow) {
  const scope = normalizeStaffVenueScope(profile.venue_scope ?? []);
  const location = normalizeShowLocation(show.venue);
  return Boolean(location && (scope.includes("all") || scope.includes(location)));
}

function isValidMergedParent(table: TableRow, tablesById: Map<string, TableRow>) {
  const memberIds = Array.from(new Set(table.merged_from ?? []));
  if (
    table.is_physical ||
    !table.is_override ||
    table.availability_scope !== "operational" ||
    table.merged_parent_id ||
    memberIds.length < 2 ||
    memberIds.length !== (table.merged_from ?? []).length ||
    !table.capacity_configured ||
    table.capacity === null
  ) {
    return false;
  }

  const members = memberIds
    .map((id) => tablesById.get(id))
    .filter((member): member is TableRow => Boolean(member));
  return (
    members.length === memberIds.length &&
    members.every(
      (member) =>
        member.is_physical &&
        member.capacity_configured &&
        member.capacity !== null &&
        member.status === "disabled" &&
        !member.booking_id &&
        member.merged_parent_id === table.id &&
        normalizeZone(member.section) === normalizeZone(table.section),
    ) &&
    members.reduce((total, member) => total + Number(member.capacity), 0) ===
      Number(table.capacity)
  );
}

function getAllowedTemporaryCapacities(
  zoneId: CorporateFloorZone,
  tables: TableRow[],
) {
  const observedCounts = new Map<number, number>();
  tables
    .filter(
      (table) =>
        normalizeZone(table.section) === zoneId &&
        !table.is_physical &&
        table.is_override &&
        table.availability_scope === "operational" &&
        !table.merged_parent_id &&
        (table.merged_from ?? []).length === 0 &&
        table.capacity_configured &&
        Number(table.capacity) > 0,
    )
    .forEach((table) => {
      const capacity = Number(table.capacity);
      observedCounts.set(capacity, (observedCounts.get(capacity) ?? 0) + 1);
    });

  const repeatedOperationalCapacities = [...observedCounts.entries()]
    .filter(([, count]) => count >= 2)
    .map(([capacity]) => capacity);
  const configuredPhysicalCapacities = tables
    .filter(
      (table) =>
        normalizeZone(table.section) === zoneId &&
        table.is_physical &&
        table.capacity_configured &&
        Number(table.capacity) > 0,
    )
    .map((table) => Number(table.capacity));
  const catalogueDefaults = physicalTableDefinitions
    .filter(
      (definition) =>
        definition.zoneId === zoneId && definition.defaultCapacity !== null,
    )
    .map((definition) => Number(definition.defaultCapacity));

  return Array.from(
    new Set([
      ...repeatedOperationalCapacities,
      ...configuredPhysicalCapacities,
      ...catalogueDefaults,
    ]),
  ).sort((left, right) => left - right);
}

async function authorize(request: Request) {
  const auth = await requireActiveStaff(request);
  if (auth.error || !auth.serviceClient || !auth.staffProfile || !auth.user) {
    return { auth, error: auth.error };
  }
  const role = Array.isArray(auth.staffProfile.roles)
    ? auth.staffProfile.roles[0]
    : auth.staffProfile.roles;
  const permissions = getRolePermissions(role);
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

async function loadPlan(
  serviceClient: NonNullable<
    Awaited<ReturnType<typeof requireActiveStaff>>["serviceClient"]
  >,
  showReference: string,
) {
  const { data: showRows, error: showError } = await serviceClient
    .from("shows")
    .select("id,date,time,venue,status,notes,updated_at");
  if (showError) throw showError;

  const show = ((showRows ?? []) as ShowRow[]).find(
    (candidate) =>
      candidate.id === showReference ||
      getLegacyShowId(candidate.notes) === showReference,
  );
  if (!show) return null;

  const [bookingResult, tableResult, settingsResult] = await Promise.all([
    serviceClient
      .from("bookings")
      .select(
        "id,booking_reference,booking_source,booking_origin,booking_status,guest_count,section,zone_entitlements,table_id,updated_at",
      )
      .eq("show_id", show.id)
      .is("archived_at", null),
    serviceClient
      .from("show_tables")
      .select(
        "id,table_code,section,capacity,capacity_configured,status,booking_id,is_physical,is_override,availability_scope,merged_from,merged_parent_id,updated_at",
      )
      .eq("show_id", show.id),
    serviceClient
      .from("venue_settings")
      .select("settings")
      .eq("venue_key", defaultVenueSettings.venueId)
      .maybeSingle(),
  ]);
  if (bookingResult.error) throw bookingResult.error;
  if (tableResult.error) throw tableResult.error;
  if (settingsResult.error) throw settingsResult.error;

  const bookings = (bookingResult.data ?? []) as BookingRow[];
  const tables = (tableResult.data ?? []) as TableRow[];
  const tablesById = new Map(tables.map((table) => [table.id, table]));
  const settings = normalizeVenueSettings(
    (settingsResult.data as { settings?: Parameters<typeof normalizeVenueSettings>[0] } | null)
      ?.settings,
  );
  const snapshot = {
    bookings: [...bookings]
      .map((booking) => ({
        booking_status: booking.booking_status,
        guest_count: booking.guest_count,
        id: booking.id,
        section: booking.section,
        zone_entitlements: booking.zone_entitlements,
        table_id: booking.table_id,
        updated_at: booking.updated_at,
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    show: { id: show.id, status: show.status, updated_at: show.updated_at },
    tables: [...tables]
      .map((table) => ({
        booking_id: table.booking_id,
        capacity: table.capacity,
        capacity_configured: table.capacity_configured,
        id: table.id,
        status: table.status,
        updated_at: table.updated_at,
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  };
  const snapshotToken = createHash("sha256")
    .update(JSON.stringify(snapshot))
    .digest("hex");

  const zones = corporateFloorZones.map((zoneId) => {
    const activeZoneBookings = bookings.flatMap((booking) => {
      if (!activeEntitlementStatuses.has(booking.booking_status)) return [];
      const split = booking.zone_entitlements;
      if (Array.isArray(split) && split.length > 0) {
        return split
          .filter((entitlement) => normalizeZone(entitlement.zoneId) === zoneId)
          .map((entitlement) => ({ booking, pax: Number(entitlement.pax) || 0 }));
      }
      return normalizeZone(booking.section) === zoneId
        ? [{ booking, pax: booking.guest_count }]
        : [];
    });
    const zoneTables = tables.filter(
      (table) => normalizeZone(table.section) === zoneId,
    );
    const allowedTemporaryCapacities = getAllowedTemporaryCapacities(
      zoneId,
      tables,
    );
    const availableTables = zoneTables.flatMap((table) => {
      if (
        table.status !== "available" ||
        table.booking_id ||
        table.merged_parent_id ||
        !table.capacity_configured ||
        table.capacity === null
      ) {
        return [];
      }

      let kind: FloorPlanningTable["kind"] | null = null;
      if (table.is_physical && (table.merged_from ?? []).length === 0) {
        kind = "physical";
      } else if (
        !table.is_physical &&
        table.is_override &&
        table.availability_scope === "operational" &&
        (table.merged_from ?? []).length === 0
      ) {
        kind = "temporary";
      } else if (isValidMergedParent(table, tablesById)) {
        kind = "merged";
      }

      return kind
        ? [
            {
              capacity: Number(table.capacity),
              id: table.id,
              kind,
              tableCode: table.table_code,
            } satisfies FloorPlanningTable,
          ]
        : [];
    });
    const claimedReservedCapacity = zoneTables.reduce((total, table) => {
      if (
        !table.booking_id ||
        !table.capacity_configured ||
        table.capacity === null ||
        table.merged_parent_id
      ) {
        return total;
      }
      return total + Number(table.capacity);
    }, 0);

    return buildZoneFloorCapacityPlan({
      activeEntitlementPax: activeZoneBookings.reduce(
        (total, entitlement) => total + entitlement.pax,
        0,
      ),
      allowedTemporaryCapacities,
      availableTables,
      capacityRequiredPhysicalTables: zoneTables.filter(
        (table) => table.is_physical && !table.capacity_configured,
      ).length,
      claimedReservedCapacity,
      queuedBookings: activeZoneBookings
        .filter(
          ({ booking }) =>
            !zoneTables.some((table) => table.booking_id === booking.id),
        )
        .map(({ booking, pax }) => ({
          id: `${booking.id}:${zoneId}`,
          isCorporate:
            booking.booking_origin === "corporate" ||
            booking.booking_source === "corporate-direct",
          pax,
          reference: booking.booking_reference,
        })),
      zoneCapacity: getConfiguredZoneMaxSeats(settings, getZoneById(zoneId)!),
      zoneId,
    });
  });

  return { bookings, show, snapshot, snapshotToken, tables, zones };
}

export async function GET(request: Request) {
  const { auth, error } = await authorize(request);
  if (error) return error;
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
    const result = await loadPlan(auth.serviceClient, showReference);
    if (!result) {
      return Response.json({ error: "Performance not found." }, { status: 404 });
    }
    if (!canAccessShow(auth.staffProfile, result.show)) {
      return Response.json(
        { error: "This performance is outside your assigned location." },
        { status: 403 },
      );
    }
    return Response.json(
      {
        plan: {
          generatedAt: new Date().toISOString(),
          showId: result.show.id,
          snapshotToken: result.snapshotToken,
          zones: result.zones,
        },
        show: {
          date: result.show.date,
          id: result.show.id,
          time: result.show.time,
          venue: result.show.venue,
        },
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (loadError) {
    console.error("[Zingara Floor Capacity] Planning failed", loadError);
    return Response.json(
      { error: "The show-wide Floor capacity plan could not be generated." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const { auth, error } = await authorize(request);
  if (error) return error;
  if (!auth.serviceClient || !auth.staffProfile || !auth.user) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    action?: "assign" | "create" | "release" | "release-table";
    bookingReference?: string;
    capacities?: number[];
    confirmCreate?: boolean;
    expectedTableIds?: string[];
    expectedUpdatedAt?: string;
    showReference?: string;
    snapshotToken?: string;
    tableIds?: string[];
    tableId?: string;
    zoneId?: string;
  };
  const showReference = body.showReference?.trim() ?? "";
  const zoneId = body.zoneId?.trim() as CorporateFloorZone;

  if (body.action === "release-table") {
    const bookingReference = body.bookingReference?.trim() ?? "";
    const tableId = body.tableId?.trim() ?? "";
    if (!bookingReference || !tableId || !body.expectedUpdatedAt?.trim()) {
      return Response.json(
        { error: "A current Corporate table claim is required." },
        { status: 400 },
      );
    }
    try {
      const { data, error: releaseError } = await auth.serviceClient.rpc(
        "release_corporate_booking_table_atomic",
        {
          p_actor_auth_user_id: auth.user.id,
          p_actor_staff_profile_id: auth.staffProfile.id,
          p_booking_reference: bookingReference,
          p_expected_table_ids: body.expectedTableIds ?? [],
          p_expected_updated_at: body.expectedUpdatedAt,
          p_table_id: tableId,
        },
      );
      if (releaseError) throw releaseError;
      return Response.json({ ok: true, result: data });
    } catch (releaseError) {
      const message =
        releaseError instanceof Error
          ? releaseError.message
          : String(releaseError);
      if (/FLOOR_PLAN_STALE|TABLE_CLAIM/i.test(message)) {
        return Response.json(
          { error: "FLOOR PLAN CHANGED - REVIEW AGAIN" },
          { status: 409 },
        );
      }
      console.error(
        "[Zingara Floor Capacity] Table release failed",
        releaseError,
      );
      return Response.json(
        { error: "The Corporate table was not released." },
        { status: 500 },
      );
    }
  }

  if (body.action === "release") {
    const bookingReference = body.bookingReference?.trim() ?? "";
    if (!bookingReference || !body.expectedUpdatedAt?.trim()) {
      return Response.json({ error: "A current Corporate assignment is required." }, { status: 400 });
    }
    try {
      const { data, error: releaseError } = await auth.serviceClient.rpc(
        "release_corporate_booking_tables_atomic",
        {
          p_actor_auth_user_id: auth.user.id,
          p_actor_staff_profile_id: auth.staffProfile.id,
          p_booking_reference: bookingReference,
          p_expected_table_ids: body.expectedTableIds ?? [],
          p_expected_updated_at: body.expectedUpdatedAt,
        },
      );
      if (releaseError) throw releaseError;
      return Response.json({ ok: true, result: data });
    } catch (releaseError) {
      const message = releaseError instanceof Error ? releaseError.message : String(releaseError);
      if (/FLOOR_PLAN_STALE|TABLE_ASSIGNMENT/i.test(message)) {
        return Response.json({ error: "FLOOR PLAN CHANGED - REVIEW AGAIN" }, { status: 409 });
      }
      console.error("[Zingara Floor Capacity] Assignment release failed", releaseError);
      return Response.json({ error: "The Corporate table assignment was not released." }, { status: 500 });
    }
  }

  if (
    !showReference ||
    !body.snapshotToken?.trim()
  ) {
    return Response.json(
      { error: "Review one current show-wide Floor plan before continuing." },
      { status: 400 },
    );
  }

  try {
    const result = await loadPlan(auth.serviceClient, showReference);
    if (!result) {
      return Response.json({ error: "Performance not found." }, { status: 404 });
    }
    if (!canAccessShow(auth.staffProfile, result.show)) {
      return Response.json(
        { error: "This performance is outside your assigned location." },
        { status: 403 },
      );
    }
    if (result.show.status !== "active" && body.action !== "assign") {
      return Response.json(
        { error: "Temporary Floor capacity can be created only for an active performance." },
        { status: 409 },
      );
    }
    if (body.action === "assign") {
      if (!corporateFloorZones.includes(zoneId)) {
        return Response.json({ error: "Select a valid Corporate seating zone." }, { status: 400 });
      }
      const bookingReference = body.bookingReference?.trim() ?? "";
      const requestedTableIds = Array.from(new Set(body.tableIds ?? []));
      const bookingPlan = result.zones
        .find((zone) => zone.zoneId === zoneId)
        ?.bookingPlans.find((booking) => booking.bookingReference === bookingReference);
      const currentBooking = result.bookings.find(
        (booking) => booking.booking_reference === bookingReference,
      );
      const currentClaimIds = result.tables
        .filter((table) => table.booking_id === currentBooking?.id)
        .map((table) => table.id)
        .sort();
      const isExactIdempotentReplay = Boolean(
        currentBooking?.table_id &&
          requestedTableIds.includes(currentBooking.table_id) &&
          JSON.stringify([...requestedTableIds].sort()) ===
            JSON.stringify(currentClaimIds),
      );
      if (
        (result.snapshotToken !== body.snapshotToken.trim() &&
          !isExactIdempotentReplay) ||
        (!bookingPlan && !isExactIdempotentReplay) ||
        bookingPlan?.unresolvedReason ||
        (bookingPlan?.newCapacities.length ?? 0) > 0 ||
        requestedTableIds.length === 0 ||
        (bookingPlan &&
          JSON.stringify(requestedTableIds) !==
            JSON.stringify(bookingPlan.existingTableIds)) ||
        !body.expectedUpdatedAt?.trim()
      ) {
        return Response.json({ error: "FLOOR PLAN CHANGED - REVIEW AGAIN" }, { status: 409 });
      }
      const selectedTableState = result.snapshot.tables.filter((table) =>
        requestedTableIds.includes(table.id),
      );
      const { data, error: assignmentError } = await auth.serviceClient.rpc(
        "assign_corporate_booking_zone_tables_atomic",
        {
          p_actor_auth_user_id: auth.user.id,
          p_actor_staff_profile_id: auth.staffProfile.id,
          p_booking_reference: bookingReference,
          p_zone: zoneId,
          p_expected_table_state: selectedTableState,
          p_expected_updated_at: body.expectedUpdatedAt,
          p_table_ids: requestedTableIds,
        },
      );
      if (assignmentError) {
        const message = assignmentError.message;
        if (
          /FLOOR_PLAN_STALE|COMBINED_TABLE_CAPACITY_INSUFFICIENT|CROSS_SHOW|CROSS_ZONE|MERGED_|TABLE_CAPACITY_REQUIRED|ZONE_CAPACITY_INSUFFICIENT/i.test(
            message,
          )
        ) {
          return Response.json(
            { error: "FLOOR PLAN CHANGED - REVIEW AGAIN" },
            { status: 409 },
          );
        }
        if (/TABLE_ALREADY_CLAIMED|TABLE_NOT_AVAILABLE/i.test(message)) {
          return Response.json(
            { error: "TABLE NO LONGER AVAILABLE" },
            { status: 409 },
          );
        }
        if (
          /CORPORATE_BOOKING_NOT_FOUND|CORPORATE_BOOKING_REQUIRED|ACTIVE_CORPORATE_BOOKING_REQUIRED/i.test(
            message,
          )
        ) {
          return Response.json(
            { error: "BOOKING STATE CHANGED" },
            { status: 409 },
          );
        }
        if (/FLOOR_MANAGEMENT_PERMISSION_REQUIRED|SHOW_OUTSIDE_STAFF_SCOPE/i.test(message)) {
          return Response.json(
            { error: "Booking and table management access is required." },
            { status: 403 },
          );
        }
        console.error(
          "[Zingara Floor Capacity] Corporate assignment failed",
          assignmentError,
        );
        return Response.json(
          { error: "ASSIGNMENT COULD NOT BE COMPLETED" },
          { status: 500 },
        );
      }
      return Response.json({ ok: true, result: data });
    }

    if (result.snapshotToken !== body.snapshotToken.trim()) {
      return Response.json(
        { error: "FLOOR PLAN CHANGED - REVIEW AGAIN" },
        { status: 409 },
      );
    }

    if (
      body.action !== "create" ||
      body.confirmCreate !== true ||
      !corporateFloorZones.includes(zoneId)
    ) {
      return Response.json(
        { error: "Review and confirm one current zone plan before creating tables." },
        { status: 400 },
      );
    }

    const zonePlan = result.zones.find((zone) => zone.zoneId === zoneId);
    const requestedCapacities = (body.capacities ?? [])
      .map((capacity) => Math.trunc(Number(capacity)))
      .sort((left, right) => left - right);
    const plannedCapacities = (zonePlan?.bookingPlans ?? [])
      .flatMap((booking) => booking.newCapacities)
      .sort((left, right) => left - right);
    if (
      !zonePlan ||
      zonePlan.zoneCapacityInsufficient ||
      plannedCapacities.length === 0 ||
      JSON.stringify(requestedCapacities) !== JSON.stringify(plannedCapacities)
    ) {
      return Response.json(
        { error: "The approved temporary-table plan no longer matches the current Floor shortfall." },
        { status: 409 },
      );
    }

    const role = Array.isArray(auth.staffProfile.roles)
      ? auth.staffProfile.roles[0]?.name ?? "staff"
      : auth.staffProfile.roles?.name ?? "staff";
    const { data, error: creationError } = await auth.serviceClient.rpc(
      "create_temporary_floor_capacity_plan_atomic",
      {
        p_actor_auth_user_id: auth.user.id,
        p_actor_location_scope: auth.staffProfile.venue_scope ?? [],
        p_actor_name: auth.staffProfile.full_name ?? auth.user.email,
        p_actor_role: role,
        p_actor_staff_profile_id: auth.staffProfile.id,
        p_capacities: requestedCapacities,
        p_expected_booking_state: result.snapshot.bookings,
        p_expected_table_state: result.snapshot.tables,
        p_plan_summary: zonePlan,
        p_show_id: result.show.id,
        p_zone_id: zoneId,
      },
    );
    if (creationError) {
      if (
        creationError.message.includes("FLOOR_PLAN_STALE") ||
        creationError.message.includes("TABLE_CODE_COLLISION")
      ) {
        return Response.json(
          { error: "FLOOR PLAN CHANGED - REVIEW AGAIN" },
          { status: 409 },
        );
      }
      throw creationError;
    }

    return Response.json({ ok: true, result: data });
  } catch (creationError) {
    const message = creationError instanceof Error ? creationError.message : String(creationError);
    if (/FLOOR_PLAN_STALE|TABLE_ALREADY_CLAIMED|TABLE_NOT_AVAILABLE|COMBINED_TABLE_CAPACITY_INSUFFICIENT|CROSS_SHOW|CROSS_ZONE|MERGED_|TABLE_CAPACITY_REQUIRED/i.test(message)) {
      return Response.json(
        { error: "FLOOR PLAN CHANGED - REVIEW AGAIN" },
        { status: 409 },
      );
    }
    console.error("[Zingara Floor Capacity] Bulk creation failed", creationError);
    return Response.json(
      { error: "The temporary Floor plan was not created. No partial plan was retained." },
      { status: 500 },
    );
  }
}
