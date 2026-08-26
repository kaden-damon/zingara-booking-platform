import {
  type SeatingZoneId,
  getZoneSectionLookupTitles,
  isValidSeatingZoneId,
  normalizeShowLocation,
} from "@/lib/zingaraDemo";
import { normalizeStaffVenueScope } from "@/lib/staffLocations";
import {
  getRolePermissions,
  requireActiveStaff,
} from "@/lib/supabase/serverAdmin";
import { getPhysicalTableDefinition } from "@/lib/physicalTables";
import { tryRecordAuditEvent } from "@/lib/supabase/serverAudit";

export const dynamic = "force-dynamic";

type ShowRow = {
  id: string;
  notes: string | null;
  venue: string | null;
};

type ShowTableRow = {
  availability_scope: string;
  booking_id: string | null;
  capacity: number | null;
  capacity_configured: boolean;
  id: string;
  is_override: boolean;
  is_physical: boolean;
  merged_from: string[];
  merged_parent_id: string | null;
  override_notes: string | null;
  section: string;
  status: string;
  table_code: string;
  updated_at: string;
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

function getStaffRolePermissions(
  profile: NonNullable<
    Awaited<ReturnType<typeof requireActiveStaff>>["staffProfile"]
  >,
) {
  const role = Array.isArray(profile.roles) ? profile.roles[0] : profile.roles;
  return getRolePermissions(role);
}

async function resolveShow(
  serviceClient: NonNullable<
    Awaited<ReturnType<typeof requireActiveStaff>>["serviceClient"]
  >,
  showReference: string,
) {
  const { data, error } = await serviceClient
    .from("shows")
    .select("id,notes,venue");

  if (error) {
    throw error;
  }

  return ((data ?? []) as ShowRow[]).find(
    (show) =>
      show.id === showReference || getLegacyShowId(show.notes) === showReference,
  );
}

function canAccessShow(profile: { venue_scope: string[] }, show: ShowRow) {
  const scope = normalizeStaffVenueScope(profile.venue_scope ?? []);
  const location = normalizeShowLocation(show.venue);

  return Boolean(
    location && (scope.includes("all") || scope.includes(location)),
  );
}

async function loadZoneTables(
  serviceClient: NonNullable<
    Awaited<ReturnType<typeof requireActiveStaff>>["serviceClient"]
  >,
  showId: string,
  zoneId: SeatingZoneId,
) {
  const { data, error } = await serviceClient
    .from("show_tables")
    .select("id,table_code,section,capacity,capacity_configured,status,booking_id,is_physical,is_override,availability_scope,merged_from,merged_parent_id,override_notes,updated_at")
    .eq("show_id", showId)
    .in("section", getZoneSectionLookupTitles(zoneId));

  if (error) {
    throw error;
  }

  return (data ?? []) as ShowTableRow[];
}

export async function POST(request: Request) {
  const auth = await requireActiveStaff(request);

  if (auth.error || !auth.serviceClient || !auth.staffProfile) {
    return auth.error;
  }

  if (!getStaffRolePermissions(auth.staffProfile).includes("tables:manage")) {
    return Response.json(
      { error: "Table management access is required." },
      { status: 403 },
    );
  }

  try {
    const body = (await request.json()) as {
      action?: "create" | "merge" | "set-capacity" | "unmerge" | "update";
      capacity?: number;
      notes?: string;
      status?: string;
      tableId?: string;
      mergedTableId?: string;
      sourceTableIds?: string[];
      tableCode?: string;
      showReference?: string;
      zoneId?: string;
    };
    const showReference = body.showReference?.trim() ?? "";
    const zoneId = body.zoneId?.trim() ?? "";

    if (!showReference || !isValidSeatingZoneId(zoneId)) {
      return Response.json(
        { error: "A valid show and seating zone are required." },
        { status: 400 },
      );
    }

    if (zoneId === "elevated-stage") {
      return Response.json(
        { error: "Operational guest tables cannot be created in this zone." },
        { status: 400 },
      );
    }

    const show = await resolveShow(auth.serviceClient, showReference);

    if (!show) {
      return Response.json({ error: "Show could not be resolved." }, { status: 404 });
    }

    if (!canAccessShow(auth.staffProfile, show)) {
      return Response.json(
        { error: "This show is outside your assigned location." },
        { status: 403 },
      );
    }

    const zoneTables = await loadZoneTables(auth.serviceClient, show.id, zoneId);
    if (body.action === "update") {
      const table = zoneTables.find((row) => row.id === body.tableId);

      if (!table) {
        return Response.json(
          { error: "The selected operational table could not be resolved." },
          { status: 404 },
        );
      }

      const tableCode = body.tableCode?.trim() ?? table.table_code;
      const capacity = table.is_physical
        ? table.capacity
        : Math.trunc(Number(body.capacity) || 0);
      const status = body.status?.trim() ?? table.status;
      const notes = body.notes?.trim().slice(0, 500) ?? "";

      if (!table.is_physical && !/^TMP-[A-Z0-9][A-Z0-9-]*$/i.test(tableCode)) {
        return Response.json(
          { error: "Temporary operational table codes must start with TMP-." },
          { status: 400 },
        );
      }

      if (!table.is_physical && (!capacity || capacity < 1)) {
        return Response.json(
          { error: "A positive seat capacity is required." },
          { status: 400 },
        );
      }

      if (!["available", "booked", "disabled"].includes(status)) {
        return Response.json(
          { error: "Select a valid table status." },
          { status: 400 },
        );
      }

      if (
        zoneTables.some(
          (row) =>
            row.id !== table.id &&
            row.table_code.toLowerCase() === tableCode.toLowerCase(),
        )
      ) {
        return Response.json(
          { error: `${tableCode} already exists for this performance.` },
          { status: 409 },
        );
      }

      if (table.booking_id && status !== "booked") {
        return Response.json(
          { error: "An assigned table must remain reserved." },
          { status: 409 },
        );
      }

      const beforeValues = {
        capacity: table.capacity,
        override_notes: table.override_notes,
        status: table.status,
        table_code: table.table_code,
      };
      const updates = {
        ...(table.is_physical ? {} : { capacity, capacity_configured: true }),
        override_notes: notes || null,
        status,
        table_code: tableCode,
        updated_at: new Date().toISOString(),
      };
      const { data: updatedTable, error } = await auth.serviceClient
        .from("show_tables")
        .update(updates)
        .eq("id", table.id)
        .eq("show_id", show.id)
        .eq("updated_at", table.updated_at)
        .select("id,table_code,capacity,status,override_notes")
        .maybeSingle();

      if (error || !updatedTable) {
        if (error) {
          throw error;
        }

        return Response.json(
          { error: "The table changed before it could be saved. Refresh and retry." },
          { status: 409 },
        );
      }

      await tryRecordAuditEvent(
        auth.serviceClient,
        auth.staffProfile,
        auth.user,
        {
          action: "show_table.updated",
          afterValues: updates,
          beforeValues,
          changedFields: ["table_code", "capacity", "status", "override_notes"],
          entityId: show.id,
          entityReference: `${show.id}:${tableCode}`,
          entityType: "show",
          outcome: "success",
          reason: `Updated operational table ${tableCode} for the selected performance.`,
          request,
          sourceArea: "Operations Floor",
        },
      );

      return Response.json({ ok: true, table: updatedTable });
    }

    if (body.action === "set-capacity") {
      const table = zoneTables.find((row) => row.id === body.tableId);
      const capacity = Math.trunc(Number(body.capacity) || 0);
      const definition = table
        ? getPhysicalTableDefinition(zoneId, table.table_code)
        : undefined;

      if (!table || !table.is_physical || !definition) {
        return Response.json(
          { error: "The selected physical table could not be resolved." },
          { status: 404 },
        );
      }

      if (
        capacity < definition.minimumCapacity ||
        capacity > definition.maximumCapacity
      ) {
        return Response.json(
          {
            error: `${table.table_code} must be configured between ${definition.minimumCapacity} and ${definition.maximumCapacity} seats.`,
          },
          { status: 400 },
        );
      }

      if (table.booking_id) {
        const { data: assignedBooking, error: assignedBookingError } =
          await auth.serviceClient
            .from("bookings")
            .select("guest_count")
            .eq("id", table.booking_id)
            .maybeSingle();

        if (assignedBookingError) {
          throw assignedBookingError;
        }

        if (Number(assignedBooking?.guest_count) > capacity) {
          return Response.json(
            { error: "Capacity cannot be lower than the assigned booking's guest count." },
            { status: 409 },
          );
        }
      }

      const { data: updatedTable, error } = await auth.serviceClient
        .from("show_tables")
        .update({
          capacity,
          capacity_configured: true,
          status: table.status === "disabled" ? "available" : table.status,
          updated_at: new Date().toISOString(),
        })
        .eq("id", table.id)
        .eq("show_id", show.id)
        .eq("updated_at", table.updated_at)
        .select("id,table_code,capacity,status")
        .maybeSingle();

      if (error || !updatedTable) {
        if (error) {
          throw error;
        }

        return Response.json(
          { error: "The table capacity changed before it could be saved." },
          { status: 409 },
        );
      }

      await tryRecordAuditEvent(
        auth.serviceClient,
        auth.staffProfile,
        auth.user,
        {
          action: "show_table.capacity_set",
          afterValues: { capacity, capacity_configured: true },
          beforeValues: {
            capacity: table.capacity,
            capacity_configured: table.capacity_configured,
          },
          changedFields: ["capacity", "capacity_configured"],
          entityId: show.id,
          entityReference: `${show.id}:${table.table_code}`,
          entityType: "show",
          outcome: "success",
          reason: `Configured physical table ${table.table_code} for the selected performance.`,
          request,
          sourceArea: "Operations Floor",
        },
      );

      return Response.json({ ok: true, table: updatedTable });
    }

    if (body.action === "create") {
      const tableCode = body.tableCode?.trim() ?? "";
      const capacity = Math.trunc(Number(body.capacity) || 0);

      if (!tableCode || capacity < 1) {
        return Response.json(
          { error: "A table number and positive seat capacity are required." },
          { status: 400 },
        );
      }

      if (!/^TMP-[A-Z0-9][A-Z0-9-]*$/i.test(tableCode)) {
        return Response.json(
          {
            error:
              "Temporary operational table codes must start with TMP- and contain only letters, numbers, or hyphens.",
          },
          { status: 400 },
        );
      }

      if (
        zoneTables.some(
          (row) => row.table_code.toLowerCase() === tableCode.toLowerCase(),
        )
      ) {
        return Response.json(
          { error: `${tableCode} already exists for this performance.` },
          { status: 409 },
        );
      }

      if (getPhysicalTableDefinition(zoneId, tableCode)) {
        return Response.json(
          { error: `${tableCode} is a physical table. Configure its existing card instead.` },
          { status: 409 },
        );
      }

      const { error } = await auth.serviceClient.from("show_tables").insert({
        availability_scope: "operational",
        capacity,
        capacity_configured: true,
        is_override: true,
        is_physical: false,
        override_notes: "Created from Operations Floor table management.",
        section: zoneId,
        show_id: show.id,
        status: "available",
        table_code: tableCode,
      });

      if (error) {
        throw error;
      }

      return Response.json({ ok: true });
    }

    if (body.action === "merge") {
      const sourceTableIds = Array.from(
        new Set((body.sourceTableIds ?? []).map((id) => id.trim()).filter(Boolean)),
      );
      const existingMergedTableId = body.mergedTableId?.trim() || null;

      if (
        sourceTableIds.length < (existingMergedTableId ? 1 : 2) ||
        sourceTableIds.some((id) => !zoneTables.some((row) => row.id === id))
      ) {
        return Response.json(
          {
            error: existingMergedTableId
              ? "Select at least one compatible physical table to add."
              : "Select at least two compatible physical tables to merge.",
          },
          { status: 400 },
        );
      }

      if (
        existingMergedTableId &&
        !zoneTables.some((row) => row.id === existingMergedTableId)
      ) {
        return Response.json(
          { error: "The merged operational table could not be resolved." },
          { status: 404 },
        );
      }

      const { data: mergeResult, error: mergeError } =
        await auth.serviceClient.rpc("merge_show_tables_atomic", {
          p_existing_merged_table_id: existingMergedTableId,
          p_show_id: show.id,
          p_source_table_ids: sourceTableIds,
          p_zone_id: zoneId,
        });

      if (mergeError) {
        throw mergeError;
      }

      await tryRecordAuditEvent(
        auth.serviceClient,
        auth.staffProfile,
        auth.user,
        {
          action: existingMergedTableId
            ? "show_table.merge_extended"
            : "show_table.merged",
          afterValues: mergeResult,
          beforeValues: {
            existing_merged_table_id: existingMergedTableId,
            source_table_ids: sourceTableIds,
          },
          changedFields: ["merged_from", "capacity", "status"],
          entityId: show.id,
          entityReference: `${show.id}:${zoneId}`,
          entityType: "show",
          outcome: "success",
          reason: existingMergedTableId
            ? "Extended a flat operational merged-table unit."
            : "Created a flat operational merged-table unit.",
          request,
          sourceArea: "Operations Floor",
        },
      );

      return Response.json({ merge: mergeResult, ok: true });
    }

    if (body.action === "unmerge") {
      const mergedTableId = body.tableId?.trim() ?? "";
      const mergedTable = zoneTables.find((row) => row.id === mergedTableId);

      if (!mergedTable || mergedTable.merged_from.length < 2) {
        return Response.json(
          { error: "The merged operational table could not be resolved." },
          { status: 404 },
        );
      }

      const { data: unmergeResult, error: unmergeError } =
        await auth.serviceClient.rpc("unmerge_show_tables_atomic", {
          p_merged_table_id: mergedTable.id,
          p_show_id: show.id,
        });

      if (unmergeError) {
        throw unmergeError;
      }

      await tryRecordAuditEvent(
        auth.serviceClient,
        auth.staffProfile,
        auth.user,
        {
          action: "show_table.unmerged",
          afterValues: unmergeResult,
          beforeValues: {
            merged_from: mergedTable.merged_from,
            merged_table_id: mergedTable.id,
            table_code: mergedTable.table_code,
          },
          changedFields: ["merged_from", "merged_parent_id", "status"],
          entityId: show.id,
          entityReference: `${show.id}:${mergedTable.table_code}`,
          entityType: "show",
          outcome: "success",
          reason: `Restored the physical members of ${mergedTable.table_code}.`,
          request,
          sourceArea: "Operations Floor",
        },
      );

      return Response.json({ ok: true, unmerge: unmergeResult });
    }

    return Response.json({ error: "Unknown table operation." }, { status: 400 });
  } catch (error) {
    const message =
      typeof error === "object" && error && "message" in error
        ? String((error as { message?: unknown }).message ?? "")
        : "";

    if (message.includes("TABLE_ZONE_CAPACITY_EXCEEDED")) {
      return Response.json(
        { error: "This table change would exceed the zone's venue capacity." },
        { status: 409 },
      );
    }

    if (
      message.includes("AT_LEAST_TWO_TABLES_REQUIRED") ||
      message.includes("MERGED_MEMBER_STATE_INVALID") ||
      message.includes("MERGED_TABLE_CODE_CONFLICT") ||
      message.includes("MERGED_TABLE_HAS_BOOKING") ||
      message.includes("MERGED_TABLE_NOT_EXTENDABLE") ||
      message.includes("MERGE_SOURCE_TABLE_NOT_AVAILABLE") ||
      message.includes("TABLE_ALREADY_IN_MERGED_UNIT")
    ) {
      return Response.json(
        {
          error: message.includes("MERGED_TABLE_HAS_BOOKING")
            ? "Reallocate the attached booking before restoring the physical tables."
            : "One or more tables changed before the merge could be saved. Refresh and retry.",
        },
        { status: 409 },
      );
    }

    console.error("[Zingara API] Operational table update failed", error);
    return Response.json(
      { error: "Operational table changes could not be saved." },
      { status: 500 },
    );
  }
}
