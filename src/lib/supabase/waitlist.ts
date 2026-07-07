import { type DemoWaitlistEntry } from "@/lib/zingaraDemo";
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
  const supabaseEntries = await getSupabaseWaitlistEntries();

  if (!supabaseEntries) {
    return [];
  }

  return supabaseEntries;
}

export async function getWaitlistEntry(id: string) {
  const entries = await getWaitlistEntries();

  return entries.find((entry) => entry.id === id);
}

export async function createWaitlistEntry(entry: DemoWaitlistEntry) {
  await persistWaitlistEntriesToSupabase([entry], "/api/waitlist");

  return entry;
}

export async function updateWaitlistEntry(entry: DemoWaitlistEntry) {
  await persistWaitlistEntriesToSupabase([entry]);

  return entry;
}

export async function saveWaitlistEntries(entries: DemoWaitlistEntry[]) {
  await persistWaitlistEntriesToSupabase(entries);

  return getWaitlistEntries();
}
