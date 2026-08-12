import {
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

export async function getShows() {
  try {
    const payload = await fetchSupabaseApi<{ shows: DemoShow[] }>(
      "/api/admin/shows",
    );

    if (!payload.shows || payload.shows.length === 0) {
      return getStoredDemoShows();
    }

    return payload.shows;
  } catch (error) {
    console.error("[Zingara Supabase] Failed to load shows", error);
    return getStoredDemoShows();
  }
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
    return shows;
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
