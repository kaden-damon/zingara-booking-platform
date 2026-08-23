import {
  type DemoTable,
  type DemoShow,
  type EntryLocationKey,
  getStoredDemoShows,
  normalizeShowLocation,
  storeDemoShows,
} from "@/lib/zingaraDemo";
import { fetchSupabaseApi } from "./apiClient";

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

export type ShowsWithTables = {
  shows: DemoShow[];
  showsLoaded: boolean;
  tables: DemoTable[];
  tablesLoaded: boolean;
};
export type ShowTableScope = {
  tableLocation?: EntryLocationKey | "all";
  tableMonth?: string;
  tableShow?: string;
};

export async function getShowsWithTables(
  scope: ShowTableScope = {},
): Promise<ShowsWithTables> {
  try {
    const searchParams = new URLSearchParams();

    if (scope.tableMonth) {
      searchParams.set("tableMonth", scope.tableMonth);
    }

    if (scope.tableLocation) {
      searchParams.set("tableLocation", scope.tableLocation);
    }

    if (scope.tableShow) {
      searchParams.set("tableShow", scope.tableShow);
    }

    const queryString = searchParams.toString();
    const payload = await fetchSupabaseApi<{
      shows?: DemoShow[];
      tables?: DemoTable[];
    }>(`/api/admin/shows${queryString ? `?${queryString}` : ""}`);
    const showsLoaded = Array.isArray(payload.shows);
    const shows = showsLoaded ? payload.shows ?? [] : getStoredDemoShows();

    return {
      shows,
      showsLoaded,
      tables: payload.tables ?? [],
      tablesLoaded: Array.isArray(payload.tables),
    };
  } catch (error) {
    console.error("[Zingara Supabase] Failed to load shows", error);

    return {
      shows: getStoredDemoShows(),
      showsLoaded: false,
      tables: [],
      tablesLoaded: false,
    };
  }
}

export async function getShows() {
  return (await getShowsWithTables()).shows;
}

export async function createShow(show: DemoShow) {
  return replaceShows([...getStoredDemoShows(), show]);
}

export async function updateShow(show: DemoShow) {
  return replaceShows(
    getStoredDemoShows().map((currentShow) =>
      currentShow.id === show.id ? show : currentShow,
    ),
  );
}

export async function archiveShow(showId: string) {
  return replaceShows(
    getStoredDemoShows().map((show) =>
      show.id === showId
        ? {
            ...show,
            archivedAt: new Date().toISOString(),
            operationalStatus: "inactive",
          }
        : show,
    ),
  );
}

export async function replaceShows(shows: DemoShow[]) {
  storeDemoShows(shows);

  try {
    const payload = await fetchSupabaseApi<{ shows: DemoShow[] }>(
      "/api/admin/shows",
      {
        body: { shows },
        method: "PUT",
      },
    );

    return payload.shows ?? shows;
  } catch (error) {
    console.error("[Zingara Supabase] Failed to persist shows", error);
    throw error;
  }
}

export async function replaceShowsWithLock(
  shows: DemoShow[],
  lock: {
    lockId?: string;
    lockSessionId?: string;
    lockShowReference?: string;
  },
) {
  storeDemoShows(shows);

  try {
    const payload = await fetchSupabaseApi<{ shows: DemoShow[] }>(
      "/api/admin/shows",
      {
        body: {
          ...lock,
          shows,
        },
        method: "PUT",
      },
    );

    return payload.shows ?? shows;
  } catch (error) {
    console.error("[Zingara Supabase] Failed to persist shows", error);
    throw error;
  }
}

export type BulkShowScheduleInput = {
  address: string;
  dateFrom: string;
  dateTo: string;
  defaultStatus: NonNullable<DemoShow["operationalStatus"]>;
  description: string;
  daysOfWeek: number[];
  location: EntryLocationKey;
  tagline: string;
  time: string;
  title: string;
  weekdayStatusOverrides?: Partial<
    Record<number, NonNullable<DemoShow["operationalStatus"]>>
  >;
};

export type BulkShowScheduleResult = {
  activeCount: number;
  created: DemoShow[];
  createdCount: number;
  disabledCount: number;
  existing: DemoShow[];
  existingCount: number;
  skippedCount: number;
  tableRowsCreated: number;
  totalCandidates: number;
  wouldCreate?: number;
};

export async function previewBulkShowSchedule(input: BulkShowScheduleInput) {
  return fetchSupabaseApi<BulkShowScheduleResult>("/api/admin/shows/bulk", {
    body: { mode: "preview", schedule: input },
    method: "POST",
  });
}

export async function createBulkShowSchedule(input: BulkShowScheduleInput) {
  return fetchSupabaseApi<BulkShowScheduleResult>("/api/admin/shows/bulk", {
    body: { mode: "create", schedule: input },
    method: "POST",
  });
}

export async function createOperationalShowTable(input: {
  capacity: number;
  showReference: string;
  tableCode: string;
  zoneId: string;
}) {
  return fetchSupabaseApi<{ ok: true }>("/api/admin/show-tables", {
    body: { action: "create", ...input },
    method: "POST",
  });
}

export async function mergeOperationalShowTables(input: {
  showReference: string;
  sourceTableCodes: string[];
  zoneId: string;
}) {
  return fetchSupabaseApi<{ ok: true }>("/api/admin/show-tables", {
    body: { action: "merge", ...input },
    method: "POST",
  });
}
