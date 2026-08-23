import {
  type SeatingZoneId,
  getVenueZoneSeatCapacity,
  getZoneSectionLookupTitles,
  isValidSeatingZoneId,
  normalizeShowLocation,
} from "@/lib/zingaraDemo";
import { normalizeStaffVenueScope } from "@/lib/staffLocations";
import {
  getRolePermissions,
  requireActiveStaff,
} from "@/lib/supabase/serverAdmin";

export const dynamic = "force-dynamic";

type ShowRow = {
  id: string;
  notes: string | null;
  venue: string | null;
};

type ShowTableRow = {
  booking_id: string | null;
  capacity: number;
  id: string;
  section: string;
  status: string;
  table_code: string;
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
    .select("id,table_code,section,capacity,status,booking_id")
    .eq("show_id", showId)
    .in("section", getZoneSectionLookupTitles(zoneId));

  if (error) {
    throw error;
  }

  return (data ?? []) as ShowTableRow[];
}

function getActiveOperationalCapacity(rows: ShowTableRow[]) {
  return rows
    .filter((row) => row.status !== "disabled")
    .reduce((total, row) => total + Math.max(Number(row.capacity) || 0, 0), 0);
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
      action?: "create" | "merge";
      capacity?: number;
      sourceTableCodes?: string[];
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
    const maximum = getVenueZoneSeatCapacity(zoneId);

    if (body.action === "create") {
      const tableCode = body.tableCode?.trim() ?? "";
      const capacity = Math.trunc(Number(body.capacity) || 0);

      if (!tableCode || capacity < 1) {
        return Response.json(
          { error: "A table number and positive seat capacity are required." },
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

      if (getActiveOperationalCapacity(zoneTables) + capacity > maximum) {
        return Response.json(
          {
            error: `This table would exceed the zone's ${maximum}-seat venue capacity.`,
          },
          { status: 409 },
        );
      }

      const { error } = await auth.serviceClient.from("show_tables").insert({
        availability_scope: "operational",
        capacity,
        is_override: true,
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
      const sourceCodes = Array.from(
        new Set((body.sourceTableCodes ?? []).map((code) => code.trim()).filter(Boolean)),
      );

      if (sourceCodes.length !== 2) {
        return Response.json(
          { error: "Select exactly two available tables to merge." },
          { status: 400 },
        );
      }

      const sources = zoneTables.filter((row) => sourceCodes.includes(row.table_code));

      if (
        sources.length !== 2 ||
        sources.some((row) => row.status !== "available" || row.booking_id)
      ) {
        return Response.json(
          { error: "Both source tables must still be available and unassigned." },
          { status: 409 },
        );
      }

      const mergedCode = sourceCodes.join("+");
      const mergedCapacity = sources.reduce(
        (total, row) => total + Math.max(Number(row.capacity) || 0, 0),
        0,
      );
      const sourceIds = sources.map((source) => source.id);
      const { data: disabledRows, error: disableError } = await auth.serviceClient
        .from("show_tables")
        .update({ status: "disabled", updated_at: new Date().toISOString() })
        .in("id", sourceIds)
        .eq("status", "available")
        .is("booking_id", null)
        .select("id");

      if (disableError) {
        throw disableError;
      }

      if ((disabledRows ?? []).length !== 2) {
        if ((disabledRows ?? []).length > 0) {
          await auth.serviceClient
            .from("show_tables")
            .update({ status: "available", updated_at: new Date().toISOString() })
            .in(
              "id",
              (disabledRows ?? []).map((row) => row.id),
            );
        }

        return Response.json(
          { error: "A source table changed while the merge was being saved. Refresh and retry." },
          { status: 409 },
        );
      }

      const { data: mergedRow, error: mergeError } = await auth.serviceClient
        .from("show_tables")
        .insert({
          availability_scope: "operational",
          capacity: mergedCapacity,
          is_override: true,
          merged_from: sourceIds,
          override_notes: `Merged from ${sourceCodes.join(" and ")} in Operations Floor.`,
          section: zoneId,
          show_id: show.id,
          status: "available",
          table_code: mergedCode,
        })
        .select("id")
        .maybeSingle();

      if (mergeError || !mergedRow) {
        await auth.serviceClient
          .from("show_tables")
          .update({ status: "available", updated_at: new Date().toISOString() })
          .in("id", sourceIds);

        if (mergeError) {
          throw mergeError;
        }

        throw new Error("Merged table could not be created.");
      }

      const { error: linkError } = await auth.serviceClient
        .from("show_tables")
        .update({
          merged_parent_id: mergedRow.id,
          updated_at: new Date().toISOString(),
        })
        .in("id", sourceIds);

      if (linkError) {
        await auth.serviceClient.from("show_tables").delete().eq("id", mergedRow.id);
        await auth.serviceClient
          .from("show_tables")
          .update({ status: "available", updated_at: new Date().toISOString() })
          .in("id", sourceIds);
        throw linkError;
      }

      return Response.json({ ok: true });
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

    console.error("[Zingara API] Operational table update failed", error);
    return Response.json(
      { error: "Operational table changes could not be saved." },
      { status: 500 },
    );
  }
}
