import {
  type DemoWaitlistEntry,
  type WaitlistStatus,
  getStoredDemoWaitlist,
  storeDemoWaitlist,
} from "@/lib/zingaraDemo";
import { getSupabaseClient } from "./client";
import { getSupabaseBookingId } from "./bookings";
import { getOrCreateCustomerIdFromInfo } from "./customers";

type SupabaseWaitlistStatus =
  | "active"
  | "cancelled"
  | "contacted"
  | "converted"
  | "expired";

type SupabaseWaitlistRow = {
  converted_booking_id: string | null;
  created_at: string;
  customer_id: string;
  desired_section: string | null;
  guest_count: number;
  id: string;
  notes: string | null;
  show_id: string;
  status: SupabaseWaitlistStatus;
  updated_at: string;
};

type SupabaseShowRow = {
  date: string;
  id: string;
  notes: string | null;
  time: string;
};

const waitlistMetadataPrefix = "__zingara_waitlist_meta__:";
const showMetadataPrefix = "__zingara_show_meta__:";

function toSupabaseWaitlistStatus(
  status: WaitlistStatus,
): SupabaseWaitlistStatus {
  if (status === "promoted") {
    return "contacted";
  }

  if (status === "converted") {
    return "converted";
  }

  if (status === "removed") {
    return "cancelled";
  }

  return "active";
}

function toDemoWaitlistStatus(
  status: SupabaseWaitlistStatus,
): WaitlistStatus {
  if (status === "contacted") {
    return "promoted";
  }

  if (status === "converted") {
    return "converted";
  }

  if (status === "cancelled" || status === "expired") {
    return "removed";
  }

  return "waiting";
}

function parseShowNotes(notes: string | null) {
  if (!notes?.startsWith(showMetadataPrefix)) {
    return "";
  }

  try {
    return (
      (JSON.parse(notes.slice(showMetadataPrefix.length)) as { legacyId?: string })
        .legacyId ?? ""
    );
  } catch {
    return "";
  }
}

function parseWaitlistNotes(notes: string | null) {
  if (!notes?.startsWith(waitlistMetadataPrefix)) {
    return undefined;
  }

  try {
    return JSON.parse(notes.slice(waitlistMetadataPrefix.length)) as DemoWaitlistEntry;
  } catch {
    return undefined;
  }
}

function serializeWaitlistNotes(entry: DemoWaitlistEntry) {
  return `${waitlistMetadataPrefix}${JSON.stringify(entry)}`;
}

async function getShowRows() {
  const supabase = getSupabaseClient();

  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase.from("shows").select("id,date,time,notes");

  if (error) {
    console.error("[Zingara Supabase] Failed to load waitlist shows", error);
    return null;
  }

  return (data ?? []) as SupabaseShowRow[];
}

async function getSupabaseShowId(showId: string) {
  const showRows = await getShowRows();
  const matchedShow = showRows?.find(
    (show) => show.id === showId || parseShowNotes(show.notes) === showId,
  );

  return matchedShow?.id;
}

async function getLegacyShowId(supabaseShowId: string) {
  const showRows = await getShowRows();
  const matchedShow = showRows?.find((show) => show.id === supabaseShowId);

  return parseShowNotes(matchedShow?.notes ?? null) || supabaseShowId;
}

async function getSupabaseWaitlistRows() {
  const supabase = getSupabaseClient();

  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("waitlist_entries")
    .select(
      "id,customer_id,show_id,desired_section,guest_count,status,converted_booking_id,notes,created_at,updated_at",
    )
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[Zingara Supabase] Failed to load waitlist entries", error);
    return null;
  }

  return (data ?? []) as SupabaseWaitlistRow[];
}

async function toSupabaseWaitlistEntry(entry: DemoWaitlistEntry) {
  const customerId = await getOrCreateCustomerIdFromInfo(entry.customer);
  const showId = await getSupabaseShowId(entry.showId);
  const convertedBookingId = entry.bookingReference
    ? await getSupabaseBookingId(entry.bookingReference)
    : null;

  if (!customerId || !showId) {
    console.error("[Zingara Supabase] Failed to map waitlist relations", {
      customerId,
      entryId: entry.id,
      showId,
      sourceShowId: entry.showId,
    });
    return undefined;
  }

  return {
    converted_booking_id: convertedBookingId ?? null,
    created_at: entry.createdAt,
    customer_id: customerId,
    desired_section: entry.desiredZoneTitle ?? null,
    guest_count: entry.partySize,
    notes: serializeWaitlistNotes(entry),
    show_id: showId,
    status: toSupabaseWaitlistStatus(entry.status),
    updated_at: entry.convertedAt ?? entry.promotedAt ?? entry.createdAt,
  };
}

async function toDemoWaitlistEntry(row: SupabaseWaitlistRow): Promise<DemoWaitlistEntry> {
  const metadataEntry = parseWaitlistNotes(row.notes);

  if (metadataEntry) {
    return {
      ...metadataEntry,
      partySize: row.guest_count,
      showId: await getLegacyShowId(row.show_id),
      status: toDemoWaitlistStatus(row.status),
    };
  }

  return {
    communicationHistory: [],
    createdAt: row.created_at,
    customer: {
      email: "",
      name: "Waitlist Guest",
      phone: "",
    },
    desiredZoneTitle: row.desired_section ?? undefined,
    id: row.id,
    notes: row.notes ?? "",
    partySize: row.guest_count,
    showId: await getLegacyShowId(row.show_id),
    status: toDemoWaitlistStatus(row.status),
  };
}

async function persistWaitlistEntriesToSupabase(
  entries: DemoWaitlistEntry[],
) {
  const supabase = getSupabaseClient();

  if (!supabase) {
    return entries;
  }

  const existingRows = (await getSupabaseWaitlistRows()) ?? [];

  await Promise.all(
    entries.map(async (entry) => {
      const payload = await toSupabaseWaitlistEntry(entry);

      if (!payload) {
        return;
      }

      const existingRow = existingRows.find(
        (row) => parseWaitlistNotes(row.notes)?.id === entry.id,
      );

      if (existingRow) {
        const { error } = await supabase
          .from("waitlist_entries")
          .update(payload)
          .eq("id", existingRow.id);

        if (error) {
          console.error("[Zingara Supabase] Failed to update waitlist entry", error);
        }

        return;
      }

      const { error } = await supabase.from("waitlist_entries").insert(payload);

      if (error) {
        console.error("[Zingara Supabase] Failed to create waitlist entry", error);
      }
    }),
  );

  return entries;
}

export async function getWaitlistEntries() {
  const fallbackEntries = getStoredDemoWaitlist();
  const rows = await getSupabaseWaitlistRows();

  if (!rows) {
    return fallbackEntries;
  }

  if (rows.length === 0) {
    await persistWaitlistEntriesToSupabase(fallbackEntries);

    return fallbackEntries;
  }

  const supabaseEntries = await Promise.all(rows.map(toDemoWaitlistEntry));
  const supabaseIds = new Set(supabaseEntries.map((entry) => entry.id));

  return [
    ...supabaseEntries,
    ...fallbackEntries.filter((entry) => !supabaseIds.has(entry.id)),
  ];
}

export async function getWaitlistEntry(id: string) {
  const entries = await getWaitlistEntries();

  return entries.find((entry) => entry.id === id);
}

export async function createWaitlistEntry(entry: DemoWaitlistEntry) {
  const nextEntries = [entry, ...getStoredDemoWaitlist()];

  storeDemoWaitlist(nextEntries);
  await persistWaitlistEntriesToSupabase(nextEntries);

  return entry;
}

export async function updateWaitlistEntry(entry: DemoWaitlistEntry) {
  const nextEntries = getStoredDemoWaitlist().map((currentEntry) =>
    currentEntry.id === entry.id ? entry : currentEntry,
  );

  storeDemoWaitlist(nextEntries);
  await persistWaitlistEntriesToSupabase(nextEntries);

  return entry;
}

export async function saveWaitlistEntries(entries: DemoWaitlistEntry[]) {
  storeDemoWaitlist(entries);
  await persistWaitlistEntriesToSupabase(entries);

  return getWaitlistEntries();
}
