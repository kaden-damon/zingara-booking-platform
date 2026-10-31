import type { SupabaseClient } from "@supabase/supabase-js";

export const secretGuestListFeatureKey = "secret_guest_list_feature";

export async function loadSecretGuestListFeatureEnabled(
  client: SupabaseClient,
) {
  const { data, error } = await client
    .from("workflow_configurations")
    .select("enabled")
    .eq("workflow_key", secretGuestListFeatureKey)
    .maybeSingle();

  if (error) throw error;

  return data?.enabled === true;
}
