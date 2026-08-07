import {
  type DemoShow,
  normalizeShowLocation,
} from "@/lib/zingaraDemo";
import {
  getServiceClient,
  requireActiveStaff,
} from "@/lib/supabase/serverAdmin";
import {
  diffAuditFields,
  pickAuditFields,
  recordAuditEvent,
} from "@/lib/supabase/serverAudit";

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

export async function GET() {
  try {
    const shows = (await loadShowRows()).map(toDemoShow);

    return Response.json({ shows });
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
    const body = (await request.json()) as { shows?: DemoShow[] };
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
      existingRows.map((row) => [parseShowNotes(row.notes).legacyId || row.id, row]),
    );
    const nextShowIds = new Set(shows.map((show) => show.id));

    await Promise.all(
      shows.map((show) => {
        const existingRow = existingRowsByDemoId.get(show.id);

        if (existingRow) {
          return auth.serviceClient
            .from("shows")
            .update(toSupabaseShow(show))
            .eq("id", existingRow.id);
        }

        return auth.serviceClient.from("shows").insert(toSupabaseShow(show));
      }),
    );

    const removedRows = existingRows.filter((row) => {
      const demoId = parseShowNotes(row.notes).legacyId || row.id;

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
      persistedRows.map((row) => [parseShowNotes(row.notes).legacyId || row.id, row]),
    );

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
          entityReference: parseShowNotes(afterRow.notes).legacyId || afterRow.id,
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
          entityReference: parseShowNotes(removedRow.notes).legacyId || removedRow.id,
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

    return Response.json({ shows: persistedShows });
  } catch (error) {
    console.error("[Zingara API] Failed to persist shows", error);

    return Response.json({ error: "Shows could not be saved." }, { status: 500 });
  }
}
