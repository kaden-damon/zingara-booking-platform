import {
  type DemoWaitlistEntry,
  getStoredDemoWaitlist,
  storeDemoWaitlist,
} from "@/lib/zingaraDemo";
import { fetchSupabaseApi } from "./apiClient";

async function getSupabaseWaitlistEntries() {
  try {
    const payload = await fetchSupabaseApi<{ entries: DemoWaitlistEntry[] }>(
      "/api/admin/waitlist",
    );

    return payload.entries ?? [];
  } catch (error) {
    console.error("[Zingara Supabase] Failed to load waitlist entries", error);
    return null;
  }
}

async function persistWaitlistEntriesToSupabase(
  entries: DemoWaitlistEntry[],
  route = "/api/admin/waitlist",
) {
  try {
    const payload = await fetchSupabaseApi<{ entries: DemoWaitlistEntry[] }>(
      route,
      {
        body: { entries },
        method: "POST",
      },
    );

    return payload.entries ?? entries;
  } catch (error) {
    console.error("[Zingara Supabase] Failed to save waitlist entries", error);
    return entries;
  }
}

export async function getWaitlistEntries() {
  const fallbackEntries = getStoredDemoWaitlist();
  const supabaseEntries = await getSupabaseWaitlistEntries();

  if (!supabaseEntries) {
    return fallbackEntries;
  }

  if (supabaseEntries.length === 0) {
    await persistWaitlistEntriesToSupabase(fallbackEntries);

    return fallbackEntries;
  }

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
  await persistWaitlistEntriesToSupabase([entry], "/api/waitlist");

  return entry;
}

export async function updateWaitlistEntry(entry: DemoWaitlistEntry) {
  const nextEntries = getStoredDemoWaitlist().map((currentEntry) =>
    currentEntry.id === entry.id ? entry : currentEntry,
  );

  storeDemoWaitlist(nextEntries);
  await persistWaitlistEntriesToSupabase([entry]);

  return entry;
}

export async function saveWaitlistEntries(entries: DemoWaitlistEntry[]) {
  storeDemoWaitlist(entries);
  await persistWaitlistEntriesToSupabase(entries);

  return getWaitlistEntries();
}
