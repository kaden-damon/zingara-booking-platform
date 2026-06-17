import {
  type DemoShow,
  getStoredDemoShows,
  storeDemoShows,
} from "@/lib/zingaraDemo";
import { getSupabaseClient } from "./client";

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
      internalNotes: notes ?? "",
      legacyId: "",
    };
  }

  try {
    const parsed = JSON.parse(notes.slice(metadataPrefix.length)) as {
      internalNotes?: string;
      legacyId?: string;
    };

    return {
      internalNotes: parsed.internalNotes ?? "",
      legacyId: parsed.legacyId ?? "",
    };
  } catch {
    return {
      internalNotes: "",
      legacyId: "",
    };
  }
}

function serializeShowNotes(show: DemoShow) {
  return `${metadataPrefix}${JSON.stringify({
    internalNotes: show.internalNotes ?? "",
    legacyId: show.id,
  })}`;
}

function toDemoShow(row: SupabaseShowRow): DemoShow {
  const notes = parseShowNotes(row.notes);

  return {
    archivedAt: row.status === "archived" ? row.updated_at : undefined,
    date: row.date,
    description: row.description ?? "",
    id: notes.legacyId || row.id,
    internalNotes: notes.internalNotes,
    label: row.name,
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
    venue: show.venueName ?? "Zingara",
  };
}

export async function getShows() {
  const supabase = getSupabaseClient();

  if (!supabase) {
    return getStoredDemoShows();
  }

  const { data, error } = await supabase
    .from("shows")
    .select("id,name,description,date,time,venue,status,notes,created_at,updated_at")
    .order("date", { ascending: true })
    .order("time", { ascending: true });

  if (error || !data || data.length === 0) {
    return getStoredDemoShows();
  }

  const shows = data.map((row) => toDemoShow(row as SupabaseShowRow));

  return shows;
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
  const supabase = getSupabaseClient();

  storeDemoShows(shows);

  if (!supabase) {
    return shows;
  }

  const { data, error: loadError } = await supabase
    .from("shows")
    .select("id,name,description,date,time,venue,status,notes,created_at,updated_at");

  if (loadError) {
    console.error("[Zingara Supabase] Failed to load shows for persistence", loadError);
    return shows;
  }

  const existingRows = (data ?? []) as SupabaseShowRow[];
  const existingRowsByDemoId = new Map(
    existingRows.map((row) => [parseShowNotes(row.notes).legacyId || row.id, row]),
  );
  const nextShowIds = new Set(shows.map((show) => show.id));

  await Promise.all(
    shows.map((show) => {
      const existingRow = existingRowsByDemoId.get(show.id);

      if (existingRow) {
        return supabase
          .from("shows")
          .update(toSupabaseShow(show))
          .eq("id", existingRow.id);
      }

      return supabase.from("shows").insert(toSupabaseShow(show));
    }),
  );

  const removedRows = existingRows.filter((row) => {
    const demoId = parseShowNotes(row.notes).legacyId || row.id;

    return !nextShowIds.has(demoId);
  });

  if (removedRows.length > 0) {
    await supabase
      .from("shows")
      .delete()
      .in(
        "id",
        removedRows.map((row) => row.id),
      );
  }

  return getShows();
}
