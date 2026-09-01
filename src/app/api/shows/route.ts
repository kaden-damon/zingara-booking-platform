import {
  normalizeShowLocation,
  type DemoShow,
} from "@/lib/zingaraDemo";
import { getServiceClient } from "@/lib/supabase/serverAdmin";

export const dynamic = "force-dynamic";

type PublicShowRow = {
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

const metadataPrefix = "__zingara_show_meta__:";

function getPublicShowMetadata(notes: string | null) {
  if (!notes?.startsWith(metadataPrefix)) {
    return { address: "", legacyId: "" };
  }

  try {
    const parsed = JSON.parse(notes.slice(metadataPrefix.length)) as {
      address?: string;
      legacyId?: string;
    };

    return {
      address: parsed.address ?? "",
      legacyId: parsed.legacyId ?? "",
    };
  } catch {
    return { address: "", legacyId: "" };
  }
}

function getPublicShowStatus(
  status: PublicShowRow["status"],
): DemoShow["operationalStatus"] {
  if (status === "sold_out") return "sold-out";
  if (status === "venue_closure") return "venue-closure";
  if (status === "special_event") return "special-event";
  if (status === "archived") return "inactive";
  return status;
}

function toPublicShow(row: PublicShowRow): DemoShow {
  const metadata = getPublicShowMetadata(row.notes);
  const location = normalizeShowLocation(row.venue);

  return {
    address: metadata.address || (location ? "" : row.venue),
    archivedAt: row.status === "archived" ? row.updated_at : undefined,
    date: row.date,
    description: row.description ?? "",
    id: metadata.legacyId || row.id,
    label: row.name,
    location: location ?? undefined,
    operationalStatus: getPublicShowStatus(row.status),
    supabaseId: row.id,
    time: row.time.slice(0, 5),
    venueName: row.venue,
  };
}

export async function GET() {
  const serviceClient = getServiceClient();

  if (!serviceClient) {
    return Response.json(
      { error: "Shows are temporarily unavailable." },
      { status: 503 },
    );
  }

  const { data, error } = await serviceClient
    .from("shows")
    .select(
      "id,name,description,date,time,venue,status,notes,updated_at",
    )
    .order("date", { ascending: true })
    .order("time", { ascending: true });

  if (error) {
    console.error("[Zingara API] Failed to load public shows", error);
    return Response.json(
      { error: "Shows could not be loaded." },
      { status: 500 },
    );
  }

  return Response.json({
    shows: ((data ?? []) as PublicShowRow[]).map(toPublicShow),
  });
}
