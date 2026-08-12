import {
  defaultTables,
  type DemoShow,
  type EntryLocationKey,
  normalizeShowLocation,
} from "@/lib/zingaraDemo";
import {
  getAdminRoleFromName,
  requireActiveStaff,
} from "@/lib/supabase/serverAdmin";
import { recordAuditEvent } from "@/lib/supabase/serverAudit";

export const dynamic = "force-dynamic";

type SupabaseShowStatus =
  | "active"
  | "archived"
  | "blackout"
  | "inactive"
  | "sold_out"
  | "special_event"
  | "venue_closure";

type SupabaseShowRow = {
  date: string;
  description: string | null;
  id: string;
  name: string;
  notes: string | null;
  status: SupabaseShowStatus;
  time: string;
  updated_at?: string | null;
  venue: string;
};

type VenueTableRow = {
  base_status: "available" | "booked" | "disabled";
  capacity: number;
  id: string;
  merge_group: string | null;
  mergeable: boolean;
  notes: string | null;
  position: Record<string, unknown> | null;
  section: string;
  table_code: string;
};

type ShowTableInsert = {
  capacity: number;
  merged_from: string[];
  override_notes: string | null;
  section: string;
  show_id: string;
  status: "available" | "disabled";
  table_code: string;
  venue_table_id?: string;
};

type BulkScheduleInput = {
  address?: string;
  dateFrom?: string;
  dateTo?: string;
  defaultStatus?: NonNullable<DemoShow["operationalStatus"]>;
  description?: string;
  daysOfWeek?: number[];
  location?: string;
  tagline?: string;
  time?: string;
  title?: string;
  weekdayStatusOverrides?: Partial<
    Record<string, NonNullable<DemoShow["operationalStatus"]>>
  >;
};

type CandidateShow = DemoShow & {
  supabaseStatus: SupabaseShowStatus;
};

const metadataPrefix = "__zingara_show_meta__:";
const maxScheduleDays = 370;
const validDayIndexes = new Set([0, 1, 2, 3, 4, 5, 6]);
const tableSectionToZoneId: Record<string, string> = {
  "Elevated Stage": "elevated-stage",
  "Golden Circle": "golden-circle",
  "Middle Ring": "middle-ring",
  "Royal Balcony": "royal-balcony",
  "Royal Booths": "royal-booths",
};

function getStaffRole(auth: Awaited<ReturnType<typeof requireActiveStaff>>) {
  const role = Array.isArray(auth.staffProfile?.roles)
    ? auth.staffProfile?.roles[0]
    : auth.staffProfile?.roles;

  return getAdminRoleFromName(role?.name);
}

function hasShowManagePermission(
  auth: Awaited<ReturnType<typeof requireActiveStaff>>,
) {
  const role = Array.isArray(auth.staffProfile?.roles)
    ? auth.staffProfile?.roles[0]
    : auth.staffProfile?.roles;
  const permissions = role?.role_permissions
    ?.map((rolePermission) => rolePermission.permissions?.key)
    .filter(Boolean);

  return permissions?.includes("settings:manage") || getStaffRole(auth) === "super-admin";
}

function parseDateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

function formatDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function normalizeTime(value: string) {
  const match = value.match(/^(\d{1,2}):(\d{2})/);

  if (!match) {
    return "";
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return "";
  }

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function toSupabaseStatus(
  status: NonNullable<DemoShow["operationalStatus"]>,
): SupabaseShowStatus {
  if (status === "sold-out") {
    return "sold_out";
  }

  if (status === "special-event") {
    return "special_event";
  }

  if (status === "venue-closure") {
    return "venue_closure";
  }

  return status;
}

function toDemoStatus(status: SupabaseShowStatus): DemoShow["operationalStatus"] {
  if (status === "sold_out") {
    return "sold-out";
  }

  if (status === "special_event") {
    return "special-event";
  }

  if (status === "venue_closure") {
    return "venue-closure";
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

  return {
    archivedAt: row.status === "archived" ? row.updated_at ?? undefined : undefined,
    address: notes.address,
    date: row.date,
    description: row.description ?? "",
    id: notes.legacyId || row.id,
    internalNotes: notes.internalNotes,
    label: row.name,
    location: location ?? undefined,
    operationalStatus: toDemoStatus(row.status),
    time: row.time.slice(0, 5),
    venueName: row.venue,
  };
}

function getDuplicateKey(location: string, date: string, time: string) {
  return `${location}|${date}|${normalizeTime(time)}`;
}

function buildCandidates(input: BulkScheduleInput) {
  const location = normalizeShowLocation(input.location) as EntryLocationKey | undefined;
  const dateFrom = input.dateFrom ? parseDateOnly(input.dateFrom) : null;
  const dateTo = input.dateTo ? parseDateOnly(input.dateTo) : null;
  const time = normalizeTime(input.time ?? "");
  const daysOfWeek = Array.from(
    new Set((input.daysOfWeek ?? []).map((day) => Number(day))),
  ).filter((day) => validDayIndexes.has(day));
  const title = input.title?.trim() ?? "";

  if (!location || !dateFrom || !dateTo || !time || daysOfWeek.length === 0 || !title) {
    throw new Error("Location, date range, days, time and title are required.");
  }

  if (dateFrom.getTime() > dateTo.getTime()) {
    throw new Error("Date From must be before Date To.");
  }

  const daySpan = Math.round(
    (dateTo.getTime() - dateFrom.getTime()) / 86_400_000,
  );

  if (daySpan > maxScheduleDays) {
    throw new Error("Bulk schedules are limited to one year at a time.");
  }

  const defaultStatus = input.defaultStatus ?? "active";
  const statusOverrides = input.weekdayStatusOverrides ?? {};
  const candidates: CandidateShow[] = [];

  for (
    const cursor = new Date(dateFrom.getTime());
    cursor.getTime() <= dateTo.getTime();
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  ) {
    const day = cursor.getUTCDay();

    if (!daysOfWeek.includes(day)) {
      continue;
    }

    const date = formatDateOnly(cursor);
    const operationalStatus =
      statusOverrides[String(day)] ?? statusOverrides[day] ?? defaultStatus;
    const id = `show-${location}-${date}-${time.replace(":", "")}`;
    const show: CandidateShow = {
      address: input.address?.trim() ?? "",
      date,
      description: [input.tagline?.trim(), input.description?.trim()]
        .filter(Boolean)
        .join("\n\n"),
      id,
      internalNotes: "",
      label: title,
      location,
      operationalStatus,
      supabaseStatus: toSupabaseStatus(operationalStatus),
      time,
      venueName: location,
    };

    candidates.push(show);
  }

  return candidates;
}

function createShowInsert(show: CandidateShow) {
  return {
    date: show.date,
    description: show.description ?? null,
    name: show.label,
    notes: serializeShowNotes(show),
    status: show.supabaseStatus,
    time: show.time,
    venue: show.location ?? show.venueName,
  };
}

function createShowTableInserts(
  showId: string,
  venueTables: VenueTableRow[],
): ShowTableInsert[] {
  if (venueTables.length > 0) {
    return venueTables.map((table) => ({
      capacity: table.capacity,
      merged_from: [],
      override_notes: table.notes,
      section: tableSectionToZoneId[table.section] ?? table.section,
      show_id: showId,
      status: table.base_status === "booked" ? "available" : table.base_status,
      table_code: table.table_code,
      venue_table_id: table.id,
    }));
  }

  return defaultTables.map((table) => ({
    capacity: table.seatCapacity,
    merged_from: [],
    override_notes: table.guestNotes,
    section: table.zoneId,
    show_id: showId,
    status: table.status === "booked" ? "available" : table.status,
    table_code: table.tableNumber,
  }));
}

function summarize(
  candidates: CandidateShow[],
  existingRows: SupabaseShowRow[],
  createdRows: SupabaseShowRow[] = [],
  tableRowsCreated = 0,
) {
  const existingKeys = new Set(
    existingRows.map((show) =>
      getDuplicateKey(
        normalizeShowLocation(show.venue) ?? show.venue,
        show.date,
        show.time,
      ),
    ),
  );
  const createdKeys = new Set(
    createdRows.map((show) =>
      getDuplicateKey(
        normalizeShowLocation(show.venue) ?? show.venue,
        show.date,
        show.time,
      ),
    ),
  );
  const existing = existingRows
    .filter((row) =>
      candidates.some(
        (show) =>
          getDuplicateKey(show.location ?? "", show.date, show.time) ===
          getDuplicateKey(normalizeShowLocation(row.venue) ?? row.venue, row.date, row.time),
      ),
    )
    .map(toDemoShow);
  const created = createdRows.map(toDemoShow);
  const disabledCount = candidates.filter(
    (show) =>
      show.operationalStatus === "inactive" ||
      show.operationalStatus === "blackout" ||
      show.operationalStatus === "venue-closure",
  ).length;

  return {
    activeCount: candidates.length - disabledCount,
    created,
    createdCount: created.length,
    disabledCount,
    existing,
    existingCount: existing.length,
    skippedCount: candidates.filter((show) =>
      existingKeys.has(getDuplicateKey(show.location ?? "", show.date, show.time)),
    ).length,
    tableRowsCreated,
    totalCandidates: candidates.length,
    wouldCreate: candidates.filter(
      (show) =>
        !existingKeys.has(getDuplicateKey(show.location ?? "", show.date, show.time)) &&
        !createdKeys.has(getDuplicateKey(show.location ?? "", show.date, show.time)),
    ).length,
  };
}

export async function POST(request: Request) {
  const auth = await requireActiveStaff(request);

  if (auth.error || !auth.serviceClient) {
    return auth.error;
  }

  if (!hasShowManagePermission(auth)) {
    return Response.json(
      { error: "You do not have permission to create show schedules." },
      { status: 403 },
    );
  }

  try {
    const body = (await request.json()) as {
      mode?: "create" | "preview";
      schedule?: BulkScheduleInput;
    };
    const mode = body.mode === "create" ? "create" : "preview";
    const candidates = buildCandidates(body.schedule ?? {});
    const dateValues = candidates.map((show) => show.date);
    const earliestDate = dateValues.reduce((earliest, date) =>
      date < earliest ? date : earliest,
    );
    const latestDate = dateValues.reduce((latest, date) =>
      date > latest ? date : latest,
    );
    const location = candidates[0]?.location;

    const { data: existingData, error: existingError } = await auth.serviceClient
      .from("shows")
      .select("id,name,description,date,time,venue,status,notes,updated_at")
      .eq("venue", location)
      .gte("date", earliestDate)
      .lte("date", latestDate);

    if (existingError) {
      throw existingError;
    }

    const existingRows = (existingData ?? []) as SupabaseShowRow[];
    const existingKeys = new Set(
      existingRows.map((show) =>
        getDuplicateKey(
          normalizeShowLocation(show.venue) ?? show.venue,
          show.date,
          show.time,
        ),
      ),
    );
    const missingCandidates = candidates.filter(
      (show) =>
        !existingKeys.has(getDuplicateKey(show.location ?? "", show.date, show.time)),
    );

    if (mode === "preview" || missingCandidates.length === 0) {
      return Response.json(summarize(candidates, existingRows));
    }

    const { data: insertedShows, error: insertError } = await auth.serviceClient
      .from("shows")
      .insert(missingCandidates.map(createShowInsert))
      .select("id,name,description,date,time,venue,status,notes,updated_at");

    if (insertError) {
      throw insertError;
    }

    const createdRows = (insertedShows ?? []) as SupabaseShowRow[];
    const { data: venueTables, error: venueTablesError } =
      await auth.serviceClient
        .from("venue_tables")
        .select("id,table_code,section,capacity,base_status,mergeable,merge_group,position,notes")
        .order("section", { ascending: true })
        .order("table_code", { ascending: true });

    if (venueTablesError) {
      throw venueTablesError;
    }

    const tableRows = createdRows.flatMap((show) =>
      createShowTableInserts(show.id, (venueTables ?? []) as VenueTableRow[]),
    );

    if (tableRows.length > 0) {
      const { error: tableInsertError } = await auth.serviceClient
        .from("show_tables")
        .upsert(tableRows, { onConflict: "show_id,table_code" });

      if (tableInsertError) {
        throw tableInsertError;
      }
    }

    await recordAuditEvent(
      auth.serviceClient,
      auth.staffProfile,
      auth.user,
      {
        action: "show.bulk_create",
        afterValues: {
          active: summarize(candidates, existingRows, createdRows).activeCount,
          dateFrom: earliestDate,
          dateTo: latestDate,
          disabled: summarize(candidates, existingRows, createdRows).disabledCount,
          location: location ?? null,
          showsCreated: createdRows.length,
          showsSkipped: candidates.length - createdRows.length,
          time: candidates[0]?.time ?? null,
        },
        changedFields: ["shows_created", "shows_skipped", "table_inventory"],
        entityLocation: location ?? null,
        entityReference: `${location}-${earliestDate}-${latestDate}`,
        entityType: "show",
        outcome: "success",
        request,
        sourceArea: "Shows",
      },
    );

    return Response.json(
      summarize(candidates, existingRows, createdRows, tableRows.length),
    );
  } catch (error) {
    console.error("[Zingara API] Failed to generate show schedule", error);

    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Show schedule could not be generated.",
      },
      { status: 500 },
    );
  }
}
