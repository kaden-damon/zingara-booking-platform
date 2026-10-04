import type { SupabaseClient } from "@supabase/supabase-js";

export const kadenManagementEmail = "kaden@kaden.co.za";

function normalizeRecipients(value?: string | string[] | null) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  const seen = new Set<string>();

  return values.flatMap((email) => {
    const normalized = email.trim();
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) return [];
    seen.add(key);
    return [normalized];
  });
}

export async function resolveInternalOperationalRecipients(
  client: SupabaseClient,
  input: {
    cc?: string | string[] | null;
    to?: string | string[] | null;
  },
) {
  const to = normalizeRecipients(input.to);
  const cc = normalizeRecipients(input.cc).filter(
    (email) => !to.some((recipient) => recipient.toLowerCase() === email.toLowerCase()),
  );
  const { data, error } = await client
    .from("staff_profiles")
    .select("email")
    .ilike("email", kadenManagementEmail)
    .eq("active", true)
    .not("email", "is", null)
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  const managementEmail = data?.email?.trim();
  if (
    managementEmail &&
    !to.some((email) => email.toLowerCase() === managementEmail.toLowerCase()) &&
    !cc.some((email) => email.toLowerCase() === managementEmail.toLowerCase())
  ) {
    cc.push(managementEmail);
  }

  return { cc, to };
}
