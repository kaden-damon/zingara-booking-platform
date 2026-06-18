import {
  type AdminRole,
  adminRoleLabels,
} from "@/lib/zingaraAccess";
import { fetchSupabaseApi } from "./apiClient";

export type StaffManagementRole = {
  id: string;
  name: string;
  role: AdminRole;
};

export type StaffManagementProfile = {
  active: boolean;
  email: string;
  id: string;
  name: string;
  role: AdminRole;
  roleId: string | null;
  userId: string;
  venueScope: string[];
};

type RoleRow = {
  id: string;
  name: string;
};

type StaffProfileRow = {
  active: boolean;
  email: string;
  full_name: string;
  id: string;
  role_id: string | null;
  roles?: RoleRow | RoleRow[] | null;
  user_id: string;
  venue_scope: string[];
};

function getAdminRoleFromName(name: string | null | undefined): AdminRole {
  const matchedRole = Object.entries(adminRoleLabels).find(
    ([, label]) => label.toLowerCase() === name?.trim().toLowerCase(),
  )?.[0] as AdminRole | undefined;

  return matchedRole ?? "venue-manager";
}

function getRoleName(role: AdminRole) {
  if (role === "box-office") {
    return adminRoleLabels["box-office-staff"];
  }

  return adminRoleLabels[role];
}

function toStaffManagementRole(row: RoleRow): StaffManagementRole {
  return {
    id: row.id,
    name: row.name,
    role: getAdminRoleFromName(row.name),
  };
}

function toStaffManagementProfile(
  row: StaffProfileRow,
): StaffManagementProfile {
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

async function getRoleRows() {
  try {
    const payload = await fetchSupabaseApi<{
      roles: StaffManagementRole[];
    }>("/api/admin/roles");

    return (payload.roles ?? []).map((role) => ({
      id: role.id,
      name: role.name,
    }));
  } catch (error) {
    console.error("[Zingara Supabase Staff] Failed to load roles", error);
    return [];
  }
}

async function getRoleId(role: AdminRole) {
  try {
    const payload = await fetchSupabaseApi<{
      roleId?: string;
    }>("/api/admin/roles", {
      body: {
        action: "resolve-role-id",
        role,
      },
      method: "POST",
    });

    return payload.roleId;
  } catch (error) {
    console.error("[Zingara Supabase Staff] Failed to resolve role", error);
    return undefined;
  }
}

export async function getStaffRoles() {
  try {
    const payload = await fetchSupabaseApi<{
      roles: StaffManagementRole[];
    }>("/api/admin/roles");

    return payload.roles ?? [];
  } catch (error) {
    console.error("[Zingara Supabase Staff] Failed to load staff roles", error);
    return [];
  }
}

export async function getStaffProfiles() {
  try {
    const payload = await fetchSupabaseApi<{
      profiles: StaffManagementProfile[];
    }>("/api/admin/staff");

    return payload.profiles ?? [];
  } catch (error) {
    console.error(
      "[Zingara Supabase Staff] Failed to load staff profiles",
      error,
    );
    return [];
  }
}

export async function getStaffProfile(id: string) {
  const profiles = await getStaffProfiles();

  return profiles.find(
    (profile) => profile.id === id || profile.userId === id,
  );
}

export async function updateStaffRole(id: string, role: AdminRole) {
  try {
    const payload = await fetchSupabaseApi<{
      profile?: StaffManagementProfile;
    }>("/api/admin/staff", {
      body: {
        id,
        role,
      },
      method: "PATCH",
    });

    return payload.profile;
  } catch (error) {
    console.error(
      "[Zingara Supabase Staff] Failed to update staff role",
      error,
    );
    return undefined;
  }
}

export async function updateStaffActive(id: string, active: boolean) {
  try {
    const payload = await fetchSupabaseApi<{
      profile?: StaffManagementProfile;
    }>("/api/admin/staff", {
      body: {
        active,
        id,
      },
      method: "PATCH",
    });

    return payload.profile;
  } catch (error) {
    console.error(
      "[Zingara Supabase Staff] Failed to update staff active state",
      error,
    );
    return undefined;
  }
}

export async function deleteStaffProfile(id: string) {
  try {
    await fetchSupabaseApi<{ success: boolean }>(
      `/api/admin/staff?id=${encodeURIComponent(id)}`,
      {
        method: "DELETE",
      },
    );

    return true;
  } catch (error) {
    console.error(
      "[Zingara Supabase Staff] Failed to delete staff profile",
      error,
    );
    return false;
  }
}
