import { type User } from "@supabase/supabase-js";
import {
  type AdminRole,
  type Permission,
  type StaffSession,
  adminRoleLabels,
  rolePermissions,
} from "@/lib/zingaraAccess";
import { defaultVenueSettings } from "@/lib/zingaraDemo";
import { getSupabaseClient } from "./client";

type RoleRow = {
  description: string | null;
  id: string;
  name: string;
  role_permissions?: Array<{
    permissions?: {
      key?: string | null;
    } | null;
  }>;
};

type StaffProfileRow = {
  active: boolean;
  email: string;
  full_name: string;
  id: string;
  role_id: string | null;
  roles?: RoleRow | null;
  user_id: string;
  venue_scope: string[];
};

export type StaffProfileFallback = {
  active?: boolean;
  email: string;
  name: string;
  permissions?: Permission[];
  role: AdminRole;
  username: string;
  venueId: string;
};

const defaultRoleSeeds: Array<{
  description: string;
  role: AdminRole;
}> = [
  {
    description: "Full platform administration access.",
    role: "super-admin",
  },
  {
    description: "Venue operations, bookings, CRM, tables, and waitlist access.",
    role: "venue-manager",
  },
  {
    description: "Floor operations and ticket validation access.",
    role: "floor-manager",
  },
  {
    description: "Box office booking, communication, ticket, and waitlist access.",
    role: "box-office-staff",
  },
];

function getRoleName(role: AdminRole) {
  if (role === "box-office") {
    return adminRoleLabels["box-office-staff"];
  }

  return adminRoleLabels[role];
}

function getAdminRoleFromName(name: string | null | undefined): AdminRole {
  const matchedRole = Object.entries(adminRoleLabels).find(
    ([, label]) => label.toLowerCase() === name?.trim().toLowerCase(),
  )?.[0] as AdminRole | undefined;

  return matchedRole ?? "venue-manager";
}

function getRolePermissions(row: RoleRow | null | undefined) {
  const permissionKeys = row?.role_permissions
    ?.map((rolePermission) => rolePermission.permissions?.key)
    .filter((permission): permission is Permission =>
      Boolean(permission && permission in permissionLabels),
    );
  const role = getAdminRoleFromName(row?.name);

  return permissionKeys && permissionKeys.length > 0
    ? permissionKeys
    : rolePermissions[role] ?? [];
}

const permissionLabels: Record<Permission, string> = {
  "analytics:read": "Analytics access",
  "bookings:manage": "Bookings manage",
  "communications:manage": "Communications manage",
  "crm:read": "CRM access",
  "settings:manage": "Settings access",
  "tables:manage": "Tables manage",
  "tickets:validate": "Tickets validate",
  "waitlist:manage": "Waitlist manage",
};

async function getRoles() {
  const supabase = getSupabaseClient();

  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("roles")
    .select("id,name,description,role_permissions(permissions(key))")
    .order("name", { ascending: true });

  if (error) {
    console.error("[Zingara Supabase Auth] Failed to load roles", error);
    return null;
  }

  return (data ?? []) as RoleRow[];
}

async function ensureDefaultPermissions() {
  const supabase = getSupabaseClient();

  if (!supabase) {
    return [];
  }

  const permissionRows = Object.entries(permissionLabels).map(
    ([key, description]) => ({
      description,
      key,
    }),
  );

  const { error } = await supabase
    .from("permissions")
    .upsert(permissionRows, { onConflict: "key" });

  if (error) {
    console.error(
      "[Zingara Supabase Auth] Failed to seed permissions",
      error,
    );
  }

  const { data, error: loadError } = await supabase
    .from("permissions")
    .select("id,key");

  if (loadError) {
    console.error(
      "[Zingara Supabase Auth] Failed to load permissions",
      loadError,
    );
    return [];
  }

  return (data ?? []) as Array<{ id: string; key: Permission }>;
}

export async function ensureDefaultRoles() {
  const supabase = getSupabaseClient();

  if (!supabase) {
    return null;
  }

  let roles = await getRoles();

  if (!roles) {
    return null;
  }

  if (roles.length === 0) {
    const { error } = await supabase.from("roles").insert(
      defaultRoleSeeds.map((seed) => ({
        description: seed.description,
        name: getRoleName(seed.role),
      })),
    );

    if (error) {
      console.error("[Zingara Supabase Auth] Failed to seed roles", error);
      return roles;
    }

    roles = (await getRoles()) ?? [];
  }

  const permissions = await ensureDefaultPermissions();
  const permissionsByKey = new Map(
    permissions.map((permission) => [permission.key, permission.id]),
  );
  const rolePermissionsRows = roles.flatMap((role) => {
    const adminRole = getAdminRoleFromName(role.name);

    return (rolePermissions[adminRole] ?? []).flatMap((permission) => {
      const permissionId = permissionsByKey.get(permission);

      return permissionId
        ? [
            {
              permission_id: permissionId,
              role_id: role.id,
            },
          ]
        : [];
    });
  });

  if (rolePermissionsRows.length > 0) {
    const { error } = await supabase
      .from("role_permissions")
      .upsert(rolePermissionsRows, { onConflict: "role_id,permission_id" });

    if (error) {
      console.error(
        "[Zingara Supabase Auth] Failed to seed role permissions",
        error,
      );
    }
  }

  return (await getRoles()) ?? roles;
}

async function getRoleId(role: AdminRole) {
  const roles = await ensureDefaultRoles();
  const roleName = getRoleName(role);

  return roles?.find(
    (currentRole) =>
      currentRole.name.trim().toLowerCase() === roleName.toLowerCase(),
  )?.id;
}

function toStaffSession(row: StaffProfileRow): StaffSession | null {
  if (!row.active) {
    return null;
  }

  const role = getAdminRoleFromName(row.roles?.name);

  return {
    email: row.email,
    id: row.user_id,
    name: row.full_name,
    permissions: getRolePermissions(row.roles),
    role,
    username: row.email,
    venueId: row.venue_scope[0] ?? defaultVenueSettings.venueId,
  };
}

async function getStaffProfileByUserId(userId: string) {
  const supabase = getSupabaseClient();

  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("staff_profiles")
    .select(
      "id,user_id,full_name,email,role_id,active,venue_scope,roles(id,name,description,role_permissions(permissions(key)))",
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error(
      "[Zingara Supabase Auth] Failed to load staff profile",
      error,
    );
    return null;
  }

  return data as StaffProfileRow | null;
}

export async function getOrCreateStaffProfileSession(
  user: User,
  fallback?: StaffProfileFallback,
) {
  const supabase = getSupabaseClient();

  if (!supabase || !user.email) {
    return null;
  }

  await ensureDefaultRoles();

  const existingProfile = await getStaffProfileByUserId(user.id);

  if (existingProfile) {
    return toStaffSession(existingProfile);
  }

  const role = fallback?.role ?? "venue-manager";
  const roleId = await getRoleId(role);
  const name =
    fallback?.name ??
    (typeof user.user_metadata?.name === "string"
      ? user.user_metadata.name
      : user.email);
  const venueId =
    fallback?.venueId ??
    (typeof user.user_metadata?.venueId === "string"
      ? user.user_metadata.venueId
      : defaultVenueSettings.venueId);

  const { error } = await supabase.from("staff_profiles").insert({
    active: fallback?.active ?? true,
    email: user.email,
    full_name: name,
    role_id: roleId ?? null,
    user_id: user.id,
    venue_scope: [venueId],
  });

  if (error) {
    console.error(
      "[Zingara Supabase Auth] Failed to create staff profile",
      error,
    );
    return fallback
      ? {
          email: fallback.email,
          id: user.id,
          name: fallback.name,
          permissions: fallback.permissions ?? rolePermissions[fallback.role],
          role: fallback.role,
          username: fallback.username,
          venueId: fallback.venueId,
        }
      : null;
  }

  const createdProfile = await getStaffProfileByUserId(user.id);

  return createdProfile ? toStaffSession(createdProfile) : null;
}

export async function assignStaffRoleByEmail(
  email: string,
  role: AdminRole,
) {
  const supabase = getSupabaseClient();
  const roleId = await getRoleId(role);

  if (!supabase || !roleId) {
    return;
  }

  const { error } = await supabase
    .from("staff_profiles")
    .update({
      role_id: roleId,
      updated_at: new Date().toISOString(),
    })
    .eq("email", email.trim().toLowerCase());

  if (error) {
    console.error(
      "[Zingara Supabase Auth] Failed to assign staff role",
      error,
    );
  }
}
