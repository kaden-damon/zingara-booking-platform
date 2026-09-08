import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { StaffProfileRow } from "@/lib/supabase/serverAdmin";

export async function isPlatformOwnerIdentity(
  serviceClient: SupabaseClient,
  staffProfile: StaffProfileRow,
  user: User,
) {
  const { data, error } = await serviceClient
    .from("platform_owner_bindings")
    .select("staff_profile_id")
    .eq("staff_profile_id", staffProfile.id)
    .eq("auth_user_id", user.id)
    .eq("authority", "platform-owner")
    .maybeSingle();

  if (error) throw error;
  return Boolean(data);
}

export async function isPlatformOwnerStaffProfile(
  serviceClient: SupabaseClient,
  staffProfileId: string,
) {
  const { data, error } = await serviceClient
    .from("platform_owner_bindings")
    .select("staff_profile_id")
    .eq("staff_profile_id", staffProfileId)
    .eq("authority", "platform-owner")
    .maybeSingle();

  if (error) throw error;
  return Boolean(data);
}
