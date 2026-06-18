import {
  type AdminRole,
  adminRoleLabels,
} from "@/lib/zingaraAccess";
import { getSupabaseClient } from "./client";
import { ensureDefaultRoles } from "./staffProfiles";

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
  const supabase = getSupabaseClient();

  if (!supabase) {
    return [];
  }

  await ensureDefaultRoles();

  const { data, error } = await supabase
    .from("roles")
    .select("id,name")
    .order("name", { ascending: true });

  if (error) {
    console.error("[Zingara Supabase Staff] Failed to load roles", error);
    return [];
  }

  return (data ?? []) as RoleRow[];
}

async function getRoleId(role: AdminRole) {
  const roleRows = await getRoleRows();
  const roleName = getRoleName(role);

  return roleRows.find(
    (row) => row.name.trim().toLowerCase() === roleName.toLowerCase(),
  )?.id;
}

export async function getStaffRoles() {
  const roleRows = await getRoleRows();

  return roleRows.map(toStaffManagementRole);
}

export async function getStaffProfiles() {
  const supabase = getSupabaseClient();

  if (!supabase) {
    return [];
  }

  await ensureDefaultRoles();

  const { data, error } = await supabase
    .from("staff_profiles")
    .select("id,user_id,full_name,email,role_id,active,venue_scope,roles(id,name)")
    .order("full_name", { ascending: true });

  if (error) {
    console.error(
      "[Zingara Supabase Staff] Failed to load staff profiles",
      error,
    );
    return [];
  }

  return ((data ?? []) as unknown as StaffProfileRow[]).map(
    toStaffManagementProfile,
  );
}

export async function getStaffProfile(id: string) {
  const profiles = await getStaffProfiles();

  return profiles.find(
    (profile) => profile.id === id || profile.userId === id,
  );
}

export async function updateStaffRole(id: string, role: AdminRole) {
  const supabase = getSupabaseClient();
  const roleId = await getRoleId(role);

  if (!supabase || !roleId) {
    return undefined;
  }

  const { error } = await supabase
    .from("staff_profiles")
    .update({
      role_id: roleId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    console.error(
      "[Zingara Supabase Staff] Failed to update staff role",
      error,
    );
    return undefined;
  }

  return getStaffProfile(id);
}

export async function updateStaffActive(id: string, active: boolean) {
  const supabase = getSupabaseClient();

  if (!supabase) {
    return undefined;
  }

  const { error } = await supabase
    .from("staff_profiles")
    .update({
      active,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    console.error(
      "[Zingara Supabase Staff] Failed to update staff active state",
      error,
    );
    return undefined;
  }

  return getStaffProfile(id);
}

export async function deleteStaffProfile(id: string) {
  const supabase = getSupabaseClient();

  if (!supabase) {
    return false;
  }

  const { error } = await supabase
    .from("staff_profiles")
    .delete()
    .eq("id", id);

  if (error) {
    console.error(
      "[Zingara Supabase Staff] Failed to delete staff profile",
      error,
    );
    return false;
  }

  return true;
}
