import { type User } from "@supabase/supabase-js";
import {
  type AdminRole,
  type Permission,
  rolePermissions,
} from "@/lib/zingaraAccess";
import { defaultVenueSettings } from "@/lib/zingaraDemo";
import {
  type StaffProfileRow,
  ensureDefaultRoles,
  getAdminRoleFromName,
  getRequestingUser,
  getRoleName,
  getRolePermissions,
  getServiceClient,
  isSuperAdminProfile,
  requireActiveStaff,
  staffProfileToSession,
} from "@/lib/supabase/serverAdmin";

export const dynamic = "force-dynamic";

type StaffProfileFallback = {
  active?: boolean;
  email: string;
  name: string;
  permissions?: Permission[];
  role: AdminRole;
  username: string;
  venueId: string;
};

function toStaffManagementProfile(row: StaffProfileRow) {
  const role = Array.isArray(row.roles) ? row.roles[0] : row.roles;

  return {
    active: row.active,
    email: row.email,
    id: row.id,
    name: row.full_name,
    role: getAdminRoleFromName(role?.name),
    roleId: row.role_id,
    userId: row.user_id,
    venueScope: row.venue_scope ?? [],
  };
}

async function getStaffProfileByUserId(
  serviceClient: NonNullable<ReturnType<typeof getServiceClient>>,
  userId: string,
) {
  const { data, error } = await serviceClient
    .from("staff_profiles")
    .select(
      "id,user_id,full_name,email,role_id,active,venue_scope,roles(id,name,description,role_permissions(permissions(key)))",
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as StaffProfileRow | null;
}

async function getRoleId(
  serviceClient: NonNullable<ReturnType<typeof getServiceClient>>,
  role: AdminRole,
) {
  const roles = await ensureDefaultRoles(serviceClient);
  const roleName = getRoleName(role);

  return roles.find(
    (currentRole) =>
      currentRole.name.trim().toLowerCase() === roleName.toLowerCase(),
  )?.id;
}

async function getOrCreateSession(
  serviceClient: NonNullable<ReturnType<typeof getServiceClient>>,
  user: User,
  fallback?: StaffProfileFallback,
) {
  await ensureDefaultRoles(serviceClient);

  const existingProfile = await getStaffProfileByUserId(serviceClient, user.id);

  if (existingProfile) {
    return existingProfile.active ? staffProfileToSession(existingProfile, user) : null;
  }

  const { count, error: countError } = await serviceClient
    .from("staff_profiles")
    .select("id", { count: "exact", head: true });

  if (countError) {
    throw countError;
  }

  const role = count === 0 ? "super-admin" : fallback?.role ?? "venue-manager";
  const roleId = await getRoleId(serviceClient, role);
  const name =
    fallback?.name ??
    (typeof user.user_metadata?.name === "string"
      ? user.user_metadata.name
      : user.email ?? "");
  const venueId =
    fallback?.venueId ??
    (typeof user.user_metadata?.venueId === "string"
      ? user.user_metadata.venueId
      : defaultVenueSettings.venueId);

  const { error } = await serviceClient.from("staff_profiles").insert({
    active: fallback?.active ?? true,
    email: user.email,
    full_name: name,
    role_id: roleId ?? null,
    user_id: user.id,
    venue_scope: [venueId],
  });

  if (error) {
    throw error;
  }

  const createdProfile = await getStaffProfileByUserId(serviceClient, user.id);

  return createdProfile ? staffProfileToSession(createdProfile, user) : null;
}

async function getStaffProfiles(
  serviceClient: NonNullable<ReturnType<typeof getServiceClient>>,
) {
  await ensureDefaultRoles(serviceClient);

  const { data, error } = await serviceClient
    .from("staff_profiles")
    .select("id,user_id,full_name,email,role_id,active,venue_scope,roles(id,name)")
    .order("full_name", { ascending: true });

  if (error) {
    throw error;
  }

  return ((data ?? []) as unknown as StaffProfileRow[]).map(
    toStaffManagementProfile,
  );
}

export async function GET(request: Request) {
  const serviceClient = getServiceClient();

  if (!serviceClient) {
    return Response.json(
      { error: "Supabase service role is not configured." },
      { status: 500 },
    );
  }

  try {
    const url = new URL(request.url);

    if (url.searchParams.get("mode") === "session") {
      const user = await getRequestingUser(request);

      if (!user?.email) {
        return Response.json({ session: null });
      }

      const fallbackParam = url.searchParams.get("fallback");
      const fallback = fallbackParam
        ? (JSON.parse(fallbackParam) as StaffProfileFallback)
        : undefined;
      const session = await getOrCreateSession(serviceClient, user, fallback);

      return Response.json({ session });
    }

    const auth = await requireActiveStaff(request);

    if (auth.error || !auth.serviceClient) {
      return auth.error;
    }

    const profiles = await getStaffProfiles(auth.serviceClient);

    return Response.json({ profiles });
  } catch (error) {
    console.error("[Zingara API] Failed to load staff", error);

    return Response.json({ error: "Staff could not be loaded." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireActiveStaff(request);

  if (auth.error || !auth.serviceClient) {
    return auth.error;
  }

  if (!isSuperAdminProfile(auth.staffProfile)) {
    return Response.json(
      { error: "Super Admin access is required." },
      { status: 403 },
    );
  }

  try {
    const body = (await request.json()) as {
      active?: boolean;
      email?: string;
      id?: string;
      role?: AdminRole;
    };

    if (!body.id && !body.email) {
      return Response.json(
        { error: "Staff profile id or email is required." },
        { status: 400 },
      );
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (typeof body.active === "boolean") {
      updates.active = body.active;
    }

    if (body.role) {
      updates.role_id = (await getRoleId(auth.serviceClient, body.role)) ?? null;
    }

    const { error } = await auth.serviceClient
      .from("staff_profiles")
      .update(updates)
      .eq(body.id ? "id" : "email", body.id ?? body.email?.trim().toLowerCase());

    if (error) {
      throw error;
    }

    const profiles = await getStaffProfiles(auth.serviceClient);
    const profile = profiles.find((currentProfile) =>
      body.id
        ? currentProfile.id === body.id
        : currentProfile.email.trim().toLowerCase() ===
          body.email?.trim().toLowerCase(),
    );

    return Response.json({ profile, profiles });
  } catch (error) {
    console.error("[Zingara API] Failed to update staff", error);

    return Response.json({ error: "Staff could not be updated." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await requireActiveStaff(request);

  if (auth.error || !auth.serviceClient) {
    return auth.error;
  }

  if (!isSuperAdminProfile(auth.staffProfile)) {
    return Response.json(
      { error: "Super Admin access is required." },
      { status: 403 },
    );
  }

  try {
    const url = new URL(request.url);
    const body = (await request.json().catch(() => ({}))) as {
      id?: string;
      replacementUserId?: string;
    };
    const id = body.id ?? url.searchParams.get("id");
    const replacementUserId =
      body.replacementUserId ?? url.searchParams.get("replacementUserId");

    if (!id) {
      return Response.json({ error: "Staff profile id is required." }, { status: 400 });
    }

    if (!replacementUserId) {
      return Response.json(
        { error: "Replacement owner is required." },
        { status: 400 },
      );
    }

    const { data: profile, error: profileError } = await auth.serviceClient
      .from("staff_profiles")
      .select("id,user_id")
      .eq("id", id)
      .maybeSingle();

    if (profileError) {
      throw profileError;
    }

    if (!profile?.user_id) {
      return Response.json({ error: "Staff profile was not found." }, { status: 404 });
    }

    if (profile.user_id === auth.user?.id) {
      return Response.json(
        { error: "You cannot delete your own active staff profile." },
        { status: 400 },
      );
    }

    if (profile.user_id === replacementUserId) {
      return Response.json(
        { error: "Replacement owner must be a different staff user." },
        { status: 400 },
      );
    }

    const { data: replacementProfile, error: replacementError } =
      await auth.serviceClient
        .from("staff_profiles")
        .select("id,user_id,active")
        .eq("user_id", replacementUserId)
        .maybeSingle();

    if (replacementError) {
      throw replacementError;
    }

    if (!replacementProfile?.active) {
      return Response.json(
        { error: "Replacement owner must be an active staff user." },
        { status: 400 },
      );
    }

    const transferOperations = [
      auth.serviceClient
        .from("communications")
        .update({ created_by: replacementUserId })
        .eq("created_by", profile.user_id),
      auth.serviceClient
        .from("communication_batches")
        .update({ created_by: replacementUserId })
        .eq("created_by", profile.user_id),
      auth.serviceClient
        .from("communication_templates")
        .update({ created_by: replacementUserId })
        .eq("created_by", profile.user_id),
      auth.serviceClient
        .from("communication_templates")
        .update({ updated_by: replacementUserId })
        .eq("updated_by", profile.user_id),
      auth.serviceClient
        .from("booking_lifecycle_events")
        .update({ changed_by: replacementUserId })
        .eq("changed_by", profile.user_id),
      auth.serviceClient
        .from("ticket_validations")
        .update({ validated_by: replacementUserId })
        .eq("validated_by", profile.user_id),
    ];
    const transferResults = await Promise.all(transferOperations);
    const transferError = transferResults.find((result) => result.error)?.error;

    if (transferError) {
      throw transferError;
    }

    const { error } = await auth.serviceClient
      .from("staff_profiles")
      .delete()
      .eq("id", id);

    if (error) {
      throw error;
    }

    const { error: deleteUserError } =
      await auth.serviceClient.auth.admin.deleteUser(profile.user_id);

    if (deleteUserError) {
      throw deleteUserError;
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error("[Zingara API] Failed to delete staff profile", error);

    return Response.json(
      { error: "Staff profile could not be deleted." },
      { status: 500 },
    );
  }
}
