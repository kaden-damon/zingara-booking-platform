import { type User } from "@supabase/supabase-js";
import {
  type AdminRole,
  type Permission,
  type StaffSession,
  adminRoleLabels,
  rolePermissions,
} from "@/lib/zingaraAccess";
import { defaultVenueSettings } from "@/lib/zingaraDemo";
import { fetchSupabaseApi } from "./apiClient";

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
  try {
    const payload = await fetchSupabaseApi<{
      roles: Array<{ id: string; name: string }>;
    }>("/api/admin/roles");

    return payload.roles.map((role) => ({
      description: null,
      id: role.id,
      name: role.name,
    })) as RoleRow[];
  } catch (error) {
    console.error("[Zingara Supabase Auth] Failed to load roles", error);
    return null;
  }
}

async function ensureDefaultPermissions() {
  await ensureDefaultRoles();

  return [];
}

export async function ensureDefaultRoles() {
  try {
    const payload = await fetchSupabaseApi<{
      roles: Array<{ id: string; name: string }>;
    }>("/api/admin/roles");

    return payload.roles.map((role) => ({
      description: null,
      id: role.id,
      name: role.name,
    })) as RoleRow[];
  } catch (error) {
    console.error("[Zingara Supabase Auth] Failed to seed roles", error);
    return null;
  }
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
  const payload = await fetchSupabaseApi<{
    profiles: Array<{
      active: boolean;
      email: string;
      id: string;
      name: string;
      role: AdminRole;
      roleId: string | null;
      userId: string;
      venueScope: string[];
    }>;
  }>("/api/admin/staff");
  const profile = payload.profiles.find(
    (currentProfile) => currentProfile.userId === userId,
  );

  return profile
    ? {
        active: profile.active,
        email: profile.email,
        full_name: profile.name,
        id: profile.id,
        role_id: profile.roleId,
        roles: {
          description: null,
          id: profile.roleId ?? "",
          name: getRoleName(profile.role),
        },
        user_id: profile.userId,
        venue_scope: profile.venueScope,
      }
    : null;
}

export async function getOrCreateStaffProfileSession(
  user: User,
  fallback?: StaffProfileFallback,
) {
  if (!user.email) {
    return null;
  }

  try {
    const params = new URLSearchParams({
      mode: "session",
    });

    if (fallback) {
      params.set("fallback", JSON.stringify(fallback));
    }

    const payload = await fetchSupabaseApi<{
      session: StaffSession | null;
    }>(`/api/admin/staff?${params.toString()}`);

    return payload.session;
  } catch (error) {
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
}

export async function assignStaffRoleByEmail(
  email: string,
  role: AdminRole,
) {
  try {
    await fetchSupabaseApi("/api/admin/staff", {
      body: {
        email,
        role,
      },
      method: "PATCH",
    });
  } catch (error) {
    console.error(
      "[Zingara Supabase Auth] Failed to assign staff role",
      error,
    );
  }
}
