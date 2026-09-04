import type { SupabaseClient } from "@supabase/supabase-js";

import {
  defaultVenueSettings,
  normalizeVenueSettings,
  type DemoVenueSettings,
} from "@/lib/zingaraDemo";

export async function loadServerVenueSettings(
  client: SupabaseClient,
): Promise<DemoVenueSettings> {
  const { data, error } = await client
    .from("venue_settings")
    .select("settings")
    .eq("venue_key", defaultVenueSettings.venueId)
    .maybeSingle();

  if (error) throw error;

  return normalizeVenueSettings(
    (data as { settings?: DemoVenueSettings | null } | null)?.settings,
  );
}
