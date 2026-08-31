import {
  type DemoTable,
  type DemoShow,
  type TableAvailabilityScope,
  type SeatingZoneId,
  type TableStatus,
  isValidSeatingZoneId,
  normalizeShowLocation,
} from "@/lib/zingaraDemo";
import {
  createBaseShowTableInserts,
  type VenueTableTemplate,
} from "@/lib/showTableBaseLayout";
import {
  getServiceClient,
  requireActiveStaff,
} from "@/lib/supabase/serverAdmin";
import {
  diffAuditFields,
  pickAuditFields,
  recordAuditEvent,
} from "@/lib/supabase/serverAudit";
import { notifyAppleWalletShow } from "@/lib/appleWalletSync";
import { after } from "next/server";

export const dynamic = "force-dynamic";

type SupabaseShowRow = {
  created_at?: string;
  date: string;
  description: string | null;
  id: string;
  name: string;
  notes: string | null;
  status:
    | "active"
    | "archived"
    | "blackout"
    | "inactive"
    | "sold_out"
    | "special_event"
    | "venue_closure";
  time: string;
  updated_at?: string;
  venue: string;
};

type SupabaseShowTableRow = {
  availability_scope?: TableAvailabilityScope | null;
  booking_id: string | null;
  capacity: number | null;
  capacity_configured?: boolean | null;
  id: string;
  is_physical?: boolean | null;
  merged_from?: string[] | null;
  merged_parent_id?: string | null;
  override_notes?: string | null;
  section: string | null;
  show_id: string;
  status: string | null;
  table_code: string;
};

type SupabaseBookingReferenceRow = {
  booking_reference: string;
  id: string;
};

type SupabaseShowWrite = {
  date: string;
  description: string | null;
  name: string;
  notes: string | null;
  status: SupabaseShowRow["status"];
  time: string;
  venue: string;
};

const metadataPrefix = "__zingara_show_meta__:";
const staleLockMs = 5 * 60 * 1000;
const sectionAliases: Record<string, SeatingZoneId> = {
  booth: "royal-booths",
  booths: "royal-booths",
  "elevated stage": "elevated-stage",
  "elevated-stage": "elevated-stage",
  "golden circle": "golden-circle",
  "golden-circle": "golden-circle",
  "middle ring": "middle-ring",
  "middle-ring": "middle-ring",
  "private booth": "royal-booths",
  "private booths": "royal-booths",
  "royal balcony": "royal-balcony",
  "royal booths": "royal-booths",
  "royal-balcony": "royal-balcony",
  "royal-booths": "royal-booths",
};
const showAuditFields = [
  "name",
  "description",
  "date",
  "time",
  "venue",
  "status",
  "notes",
];

function toSupabaseStatus(
  status: DemoShow["operationalStatus"],
): SupabaseShowRow["status"] {
  if (status === "sold-out") {
    return "sold_out";
  }

  if (status === "venue-closure") {
    return "venue_closure";
  }

  if (status === "special-event") {
    return "special_event";
  }

  return status ?? "active";
}

function toDemoStatus(
  status: SupabaseShowRow["status"],
): DemoShow["operationalStatus"] {
  if (status === "sold_out") {
    return "sold-out";
  }

  if (status === "venue_closure") {
    return "venue-closure";
  }

  if (status === "special_event") {
    return "special-event";
  }

  if (status === "archived") {
    return "inactive";
  }

  return status;
}

function parseShowNotes(notes: string | null) {
  if (!notes?.startsWith(metadataPrefix)) {
    return {
      address: "",
      internalNotes: notes ?? "",
      legacyId: "",
    };
  }

  try {
    const parsed = JSON.parse(notes.slice(metadataPrefix.length)) as {
      address?: string;
      internalNotes?: string;
      legacyId?: string;
    };

    return {
      address: parsed.address ?? "",
      internalNotes: parsed.internalNotes ?? "",
      legacyId: parsed.legacyId ?? "",
    };
  } catch {
    return {
      address: "",
      internalNotes: "",
      legacyId: "",
    };
  }
}

function getShowReference(row: SupabaseShowRow) {
  return parseShowNotes(row.notes).legacyId || row.id;
}

function serializeShowNotes(show: DemoShow) {
  return `${metadataPrefix}${JSON.stringify({
    address: show.address ?? "",
    internalNotes: show.internalNotes ?? "",
    legacyId: show.id,
  })}`;
}

function toDemoShow(row: SupabaseShowRow): DemoShow {
  const notes = parseShowNotes(row.notes);
  const location = normalizeShowLocation(row.venue);
  const legacyAddress = location ? "" : row.venue;

  return {
    archivedAt: row.status === "archived" ? row.updated_at : undefined,
    address: notes.address || legacyAddress,
    date: row.date,
    description: row.description ?? "",
    id: notes.legacyId || row.id,
    internalNotes: notes.internalNotes,
    label: row.name,
    location: location ?? undefined,
    operationalStatus: toDemoStatus(row.status),
    supabaseId: row.id,
    time: row.time.slice(0, 5),
    venueName: row.venue,
  };
}

function toSupabaseShow(show: DemoShow): SupabaseShowWrite {
  return {
    date: show.date,
    description: show.description ?? null,
    name: show.label,
    notes: serializeShowNotes(show),
    status: show.archivedAt ? "archived" : toSupabaseStatus(show.operationalStatus),
    time: show.time,
    venue: normalizeShowLocation(show.location ?? show.venueName) ?? "",
  };
}

function normalizeShowTableSection(section: string | null): SeatingZoneId | null {
  const normalizedSection = (section ?? "").trim().toLowerCase();

  if (isValidSeatingZoneId(normalizedSection)) {
    return normalizedSection;
  }

  return sectionAliases[normalizedSection] ?? null;
}

function toDemoTableStatus(status: string | null): TableStatus {
  if (status === "booked") {
    return "booked";
  }

  return status === "disabled" ? "disabled" : "available";
}

function toDemoTable(
  row: SupabaseShowTableRow,
  showReferenceById: Map<string, string>,
  bookingReferenceById: Map<string, string>,
  demoTableIdByAuthoritativeId: Map<string, string>,
): DemoTable | null {
  const showReference = showReferenceById.get(row.show_id);
  const zoneId = normalizeShowTableSection(row.section);

  if (!showReference || !zoneId) {
    return null;
  }

  const status = toDemoTableStatus(row.status);
  const capacityConfigured =
    row.capacity_configured !== false && row.capacity !== null;
  const capacity = capacityConfigured && Number.isFinite(Number(row.capacity))
    ? Number(row.capacity)
    : 0;
  const mergedFrom = (row.merged_from ?? [])
    .map((tableId) => demoTableIdByAuthoritativeId.get(tableId))
    .filter((tableId): tableId is string => Boolean(tableId));

  return {
    availabilityScope: row.availability_scope ?? "public",
    authoritativeId: row.id,
    baseGuestNotes: "",
    baseSeatCapacity: capacity,
    baseStatus: status === "disabled" ? "disabled" : "available",
    bookingReference: row.booking_id
      ? bookingReferenceById.get(row.booking_id)
      : undefined,
    guestNotes: row.override_notes ?? "",
    id: row.id,
    capacityConfigured,
    physicalTable: row.is_physical === true,
    mergedFrom: mergedFrom.length > 0 ? mergedFrom : undefined,
    mergedInto: row.merged_parent_id
      ? demoTableIdByAuthoritativeId.get(row.merged_parent_id)
      : undefined,
    seatCapacity: capacity,
    showId: showReference,
    status,
    tableNumber: row.table_code,
    zoneId,
  };
}

async function loadShowRows() {
  const serviceClient = getServiceClient();

  if (!serviceClient) {
    throw new Error("Supabase service role is not configured.");
  }

  const { data, error } = await serviceClient
    .from("shows")
    .select("id,name,description,date,time,venue,status,notes,created_at,updated_at")
    .order("date", { ascending: true })
    .order("time", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as SupabaseShowRow[];
}

async function loadVenueTableRows() {
  const serviceClient = getServiceClient();

  if (!serviceClient) {
    throw new Error("Supabase service role is not configured.");
  }

  const { data, error } = await serviceClient
    .from("venue_tables")
    .select("id,table_code,section,capacity,base_status,notes,is_physical")
    .order("section", { ascending: true })
    .order("table_code", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as VenueTableTemplate[];
}

async function loadShowTableRows(showIds: string[]) {
  if (showIds.length === 0) {
    return [];
  }

  const serviceClient = getServiceClient();

  if (!serviceClient) {
    throw new Error("Supabase service role is not configured.");
  }

  const rows: SupabaseShowTableRow[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await serviceClient
      .from("show_tables")
      .select("*")
      .in("show_id", showIds)
      .order("show_id", { ascending: true })
      .order("section", { ascending: true })
      .order("table_code", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) {
      throw error;
    }

    const pageRows = (data ?? []) as SupabaseShowTableRow[];

    rows.push(...pageRows);

    if (pageRows.length < pageSize) {
      break;
    }
  }

  return rows;
}

function getScopedShowRowsForTables(
  showRows: SupabaseShowRow[],
  tableMonth: string | null,
  tableLocation: string | null,
  tableShow: string | null,
) {
  const normalizedTableShow = tableShow?.trim();

  return showRows.filter((row) => {
    const location = normalizeShowLocation(row.venue);
    const showReference = getShowReference(row);

    return (
      (!normalizedTableShow ||
        row.id === normalizedTableShow ||
        showReference === normalizedTableShow) &&
      (!tableMonth || row.date.startsWith(`${tableMonth}-`)) &&
      (!tableLocation ||
        tableLocation === "all" ||
        location === tableLocation)
    );
  });
}

async function loadBookingReferences(bookingIds: string[]) {
  const uniqueBookingIds = [...new Set(bookingIds.filter(Boolean))];

  if (uniqueBookingIds.length === 0) {
    return new Map<string, string>();
  }

  const serviceClient = getServiceClient();

  if (!serviceClient) {
    throw new Error("Supabase service role is not configured.");
  }

  const bookingReferences = new Map<string, string>();
  const batchSize = 200;

  for (let index = 0; index < uniqueBookingIds.length; index += batchSize) {
    const { data, error } = await serviceClient
      .from("bookings")
      .select("id,booking_reference")
      .in("id", uniqueBookingIds.slice(index, index + batchSize));

    if (error) {
      throw error;
    }

    for (const row of (data ?? []) as SupabaseBookingReferenceRow[]) {
      bookingReferences.set(row.id, row.booking_reference);
    }
  }

  return bookingReferences;
}

async function expireStaleShowLocks(
  serviceClient: NonNullable<
    Awaited<ReturnType<typeof requireActiveStaff>>["serviceClient"]
  >,
) {
  await serviceClient
    .from("show_edit_locks")
    .update({
      release_reason: "heartbeat-timeout",
      released_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .is("released_at", null)
    .lt(
      "last_activity_at",
      new Date(Date.now() - staleLockMs).toISOString(),
    );
}

async function ensureNoConflictingShowLocks(
  request: Request,
  auth: Awaited<ReturnType<typeof requireActiveStaff>>,
  changedShowReferences: string[],
  lockId?: string,
  sessionId?: string,
) {
  if (!auth.serviceClient) {
    return null;
  }

  const uniqueReferences = [...new Set(changedShowReferences.filter(Boolean))];

  if (uniqueReferences.length === 0) {
    return null;
  }

  await expireStaleShowLocks(auth.serviceClient);

  const { data: activeLocks, error } = await auth.serviceClient
    .from("show_edit_locks")
    .select(
      "id,show_id,show_reference,staff_profile_id,staff_name,staff_role,session_id,last_activity_at,started_at",
    )
    .in("show_reference", uniqueReferences)
    .is("released_at", null);

  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") {
      console.warn(
        "[Zingara API] show_edit_locks table is unavailable; show lock enforcement skipped until migration is applied.",
      );

      return null;
    }

    console.error("[Zingara API] Failed to verify show edit lock", error);

    return Response.json(
      { error: "Show edit lock could not be verified." },
      { status: 500 },
    );
  }

  const conflictingLock = (activeLocks ?? []).find((lock) => {
    if (lockId && sessionId) {
      return lock.id !== lockId || lock.session_id !== sessionId;
    }

    return lock.staff_profile_id !== auth.staffProfile?.id;
  });

  if (!conflictingLock) {
    return null;
  }

  await recordAuditEvent(auth.serviceClient, auth.staffProfile, auth.user, {
    action: "show.write-blocked-by-lock",
    beforeValues: pickAuditFields(conflictingLock as Record<string, unknown>, [
      "show_reference",
      "staff_name",
      "staff_role",
      "last_activity_at",
      "started_at",
    ]),
    entityId: (conflictingLock as { show_id?: string }).show_id,
    entityReference:
      (conflictingLock as { show_reference?: string }).show_reference ??
      "unknown-show",
    entityType: "show",
    outcome: "blocked",
    reason: "A valid show edit lock exists for another staff member.",
    request,
    sourceArea: "Shows",
  });

  return Response.json(
    {
      error: "This show is currently being edited.",
      lock: conflictingLock,
    },
    { status: 409 },
  );
}

function findDuplicateActiveShow(
  show: DemoShow,
  existingRows: SupabaseShowRow[],
) {
  const location = normalizeShowLocation(show.location ?? show.venueName);

  if (!location) {
    return null;
  }

  return (
    existingRows.find((row) => {
      const existingReference = getShowReference(row);
      const existingTime = row.time.slice(0, 5);

      return (
        existingReference !== show.id &&
        row.status !== "archived" &&
        normalizeShowLocation(row.venue) === location &&
        row.date === show.date &&
        existingTime === show.time
      );
    }) ?? null
  );
}

export async function GET(request: Request) {
  const auth = await requireActiveStaff(request);

  if (auth.error || !auth.serviceClient) {
    return auth.error;
  }

  try {
    const url = new URL(request.url);
    const tableMonth = url.searchParams.get("tableMonth");
    const tableLocation = url.searchParams.get("tableLocation");
    const tableShow = url.searchParams.get("tableShow");
    const metadataOnly = url.searchParams.get("metadataOnly") === "1";
    const showRows = await loadShowRows();
    const shows = showRows.map(toDemoShow);

    if (metadataOnly) {
      return Response.json({ shows, tables: [] });
    }

    const showReferenceById = new Map(
      showRows.map((row, index) => [row.id, shows[index].id]),
    );
    const tableShowRows = getScopedShowRowsForTables(
      showRows,
      tableMonth,
      tableLocation,
      tableShow,
    );
    const tableRows = await loadShowTableRows(
      tableShowRows.map((row) => row.id),
    );
    const bookingReferenceById = await loadBookingReferences(
      tableRows.flatMap((row) => (row.booking_id ? [row.booking_id] : [])),
    );
    const demoTableIdByAuthoritativeId = new Map(
      tableRows.map((row) => [row.id, row.id]),
    );
    const tables = tableRows
      .map((row) =>
        toDemoTable(
          row,
          showReferenceById,
          bookingReferenceById,
          demoTableIdByAuthoritativeId,
        ),
      )
      .filter((table): table is DemoTable => Boolean(table));

    return Response.json({ shows, tables });
  } catch (error) {
    console.error("[Zingara API] Failed to load shows", error);

    return Response.json({ error: "Shows could not be loaded." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const auth = await requireActiveStaff(request);

  if (auth.error || !auth.serviceClient) {
    return auth.error;
  }

  try {
    const body = (await request.json()) as {
      lockId?: string;
      lockSessionId?: string;
      lockShowReference?: string;
      shows?: DemoShow[];
    };
    const shows = body.shows ?? [];

    if (
      shows.some(
        (show) => !normalizeShowLocation(show.location ?? show.venueName),
      )
    ) {
      return Response.json(
        { error: "Every show requires a valid Location." },
        { status: 400 },
      );
    }

    const existingRows = await loadShowRows();
    const existingRowsByDemoId = new Map(
      existingRows.map((row) => [getShowReference(row), row]),
    );
    const nextShowIds = new Set(shows.map((show) => show.id));
    const changedShowReferences = shows.flatMap((show) => {
      const existingRow = existingRowsByDemoId.get(show.id);

      if (!existingRow) {
        return [];
      }

      const beforeShow = toDemoShow(existingRow);
      const nextPayload = toSupabaseShow(show);
      const beforePayload = toSupabaseShow(beforeShow);
      const changed =
        nextPayload.date !== beforePayload.date ||
        nextPayload.description !== beforePayload.description ||
        nextPayload.name !== beforePayload.name ||
        nextPayload.notes !== beforePayload.notes ||
        nextPayload.status !== beforePayload.status ||
        nextPayload.time !== beforePayload.time ||
        nextPayload.venue !== beforePayload.venue;

      return changed ? [show.id] : [];
    });
    const removedShowReferences = existingRows
      .map(getShowReference)
      .filter((showReference) => !nextShowIds.has(showReference));
    const lockResponse = await ensureNoConflictingShowLocks(
      request,
      auth,
      [...changedShowReferences, ...removedShowReferences],
      body.lockId,
      body.lockSessionId,
    );

    if (lockResponse) {
      return lockResponse;
    }

    for (const show of shows) {
      const duplicateShow = findDuplicateActiveShow(show, existingRows);

      if (duplicateShow) {
        return Response.json(
          {
            error:
              "A show already exists for this location, date and time.",
            duplicateShowReference: getShowReference(duplicateShow),
          },
          { status: 409 },
        );
      }
    }

    const showsToUpdate = shows.filter((show) =>
      existingRowsByDemoId.has(show.id),
    );
    const showsToCreate = shows.filter(
      (show) => !existingRowsByDemoId.has(show.id),
    );

    for (const show of showsToUpdate) {
      const existingRow = existingRowsByDemoId.get(show.id);
      const { error } = await auth.serviceClient
        .from("shows")
        .update(toSupabaseShow(show))
        .eq("id", existingRow?.id);

      if (error) {
        throw error;
      }
    }

    let createdRows: SupabaseShowRow[] = [];

    if (showsToCreate.length > 0) {
      const { data, error } = await auth.serviceClient
        .from("shows")
        .insert(showsToCreate.map(toSupabaseShow))
        .select("id,name,description,date,time,venue,status,notes,created_at,updated_at");

      if (error) {
        throw error;
      }

      createdRows = (data ?? []) as SupabaseShowRow[];
      const venueTables = await loadVenueTableRows();
      const tableRows = createdRows.flatMap((show) =>
        createBaseShowTableInserts(show.id, venueTables),
      );
      const { error: tableInsertError } = await auth.serviceClient
        .from("show_tables")
        .insert(tableRows);

      if (tableInsertError) {
        await auth.serviceClient
          .from("shows")
          .delete()
          .in(
            "id",
            createdRows.map((show) => show.id),
          );
        throw tableInsertError;
      }
    }

    const removedRows = existingRows.filter((row) => {
      const demoId = getShowReference(row);

      return !nextShowIds.has(demoId);
    });

    if (removedRows.length > 0) {
      const { error } = await auth.serviceClient
        .from("shows")
        .delete()
        .in(
          "id",
          removedRows.map((row) => row.id),
        );

      if (error) {
        throw error;
      }
    }

    const persistedRows = await loadShowRows();
    const persistedShows = persistedRows.map(toDemoShow);
    const existingRowsById = new Map(existingRows.map((row) => [row.id, row]));
    const persistedRowsByDemoId = new Map(
      persistedRows.map((row) => [getShowReference(row), row]),
    );
    const walletChangedShowIds = persistedRows
      .filter((afterRow) => {
        const beforeRow = existingRowsById.get(afterRow.id);

        return Boolean(
          beforeRow &&
            (beforeRow.name !== afterRow.name ||
              beforeRow.date !== afterRow.date ||
              beforeRow.time !== afterRow.time ||
              beforeRow.venue !== afterRow.venue ||
              beforeRow.status !== afterRow.status),
        );
      })
      .map((row) => row.id);

    try {
      for (const show of shows) {
        const afterRow = persistedRowsByDemoId.get(show.id);
        const beforeRow = afterRow ? existingRowsById.get(afterRow.id) : null;

        if (!afterRow) {
          continue;
        }

        const diff = diffAuditFields(
          beforeRow as Record<string, unknown> | null,
          afterRow as Record<string, unknown>,
          showAuditFields,
        );

        if (beforeRow && diff.changedFields.length === 0) {
          continue;
        }

        await recordAuditEvent(auth.serviceClient, auth.staffProfile, auth.user, {
          action: beforeRow ? "show.edit" : "show.create",
          afterValues:
            diff.changedFields.length > 0
              ? diff.afterValues
              : pickAuditFields(afterRow as Record<string, unknown>, [
                  "name",
                  "date",
                  "time",
                  "venue",
                  "status",
                ]),
          beforeValues: diff.beforeValues,
          changedFields:
            diff.changedFields.length > 0
              ? diff.changedFields
              : ["name", "date", "time", "venue"],
          entityId: afterRow.id,
          entityLocation: normalizeShowLocation(afterRow.venue) ?? null,
          entityReference: getShowReference(afterRow),
          entityType: "show",
          outcome: "success",
          request,
          sourceArea: "Shows",
        });
      }

      for (const removedRow of removedRows) {
        await recordAuditEvent(auth.serviceClient, auth.staffProfile, auth.user, {
          action: "show.delete",
          beforeValues: pickAuditFields(removedRow as Record<string, unknown>, [
            "name",
            "date",
            "time",
            "venue",
            "status",
          ]),
          entityId: removedRow.id,
          entityLocation: normalizeShowLocation(removedRow.venue) ?? null,
          entityReference: getShowReference(removedRow),
          entityType: "show",
          outcome: "success",
          reason: "Show removed from admin show set.",
          request,
          sourceArea: "Shows",
        });
      }
    } catch {
      return Response.json(
        {
          auditError:
            "Shows were saved, but one or more audit events could not be recorded.",
          shows: persistedShows,
        },
        { status: 500 },
      );
    }

    for (const showId of walletChangedShowIds) {
      await notifyAppleWalletShow(auth.serviceClient, showId);
    }

    return Response.json({ shows: persistedShows });
  } catch (error) {
    console.error("[Zingara API] Failed to persist shows", error);

    return Response.json({ error: "Shows could not be saved." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireActiveStaff(request);

  if (auth.error || !auth.serviceClient || !auth.staffProfile || !auth.user) {
    return auth.error;
  }

  try {
    const body = (await request.json()) as {
      lockId?: string;
      lockSessionId?: string;
      show?: DemoShow;
    };
    const show = body.show;

    if (!show || !normalizeShowLocation(show.location ?? show.venueName)) {
      return Response.json(
        { error: "A show with a valid Location is required." },
        { status: 400 },
      );
    }

    const existingRows = await loadShowRows();
    const beforeRow = existingRows.find(
      (row) => getShowReference(row) === show.id,
    );

    if (!beforeRow) {
      return Response.json({ error: "Show could not be found." }, { status: 404 });
    }

    const lockResponse = await ensureNoConflictingShowLocks(
      request,
      auth,
      [show.id],
      body.lockId,
      body.lockSessionId,
    );

    if (lockResponse) {
      return lockResponse;
    }

    const duplicateShow = findDuplicateActiveShow(show, existingRows);

    if (duplicateShow) {
      return Response.json(
        { error: "A show already exists for this location, date and time." },
        { status: 409 },
      );
    }

    const { data, error } = await auth.serviceClient
      .from("shows")
      .update(toSupabaseShow(show))
      .eq("id", beforeRow.id)
      .select("id,name,description,date,time,venue,status,notes,created_at,updated_at")
      .maybeSingle();

    if (error || !data) {
      throw error ?? new Error("Updated show could not be loaded.");
    }

    const afterRow = data as SupabaseShowRow;
    const diff = diffAuditFields(
      beforeRow as Record<string, unknown>,
      afterRow as Record<string, unknown>,
      showAuditFields,
    );

    if (diff.changedFields.length > 0) {
      await recordAuditEvent(auth.serviceClient, auth.staffProfile, auth.user, {
        action: "show.edit",
        afterValues: diff.afterValues,
        beforeValues: diff.beforeValues,
        changedFields: diff.changedFields,
        entityId: afterRow.id,
        entityLocation: normalizeShowLocation(afterRow.venue) ?? null,
        entityReference: getShowReference(afterRow),
        entityType: "show",
        outcome: "success",
        request,
        sourceArea: "Shows",
      });
    }

    if (
      beforeRow.name !== afterRow.name ||
      beforeRow.date !== afterRow.date ||
      beforeRow.time !== afterRow.time ||
      beforeRow.venue !== afterRow.venue ||
      beforeRow.status !== afterRow.status
    ) {
      after(async () => {
        try {
          await notifyAppleWalletShow(auth.serviceClient!, afterRow.id);
        } catch (walletError) {
          console.error(
            "[Zingara API] Deferred Apple Wallet show refresh failed",
            walletError,
          );
        }
      });
    }

    return Response.json({ show: toDemoShow(afterRow) });
  } catch (error) {
    console.error("[Zingara API] Failed to update show", error);
    return Response.json({ error: "Show could not be saved." }, { status: 500 });
  }
}
