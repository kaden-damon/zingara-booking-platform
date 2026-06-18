import { createClient, type User } from "@supabase/supabase-js";
import {
  type AdminRole,
  type Permission,
  adminRoleLabels,
  rolePermissions,
} from "@/lib/zingaraAccess";

export type RoleRow = {
  description?: string | null;
  id: string;
  name: string;
  role_permissions?: Array<{
    permissions?: {
      key?: string | null;
    } | null;
  }>;
};

export type StaffProfileRow = {
  active: boolean;
  email: string;
  full_name: string;
  id: string;
  role_id: string | null;
  roles?: RoleRow | RoleRow[] | null;
  user_id: string;
  venue_scope: string[];
};

export const defaultRoleSeeds: Array<{
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

export const permissionLabels: Record<Permission, string> = {
  "analytics:read": "Analytics access",
  "bookings:manage": "Bookings manage",
  "communications:manage": "Communications manage",
  "crm:read": "CRM access",
  "settings:manage": "Settings access",
  "tables:manage": "Tables manage",
  "tickets:validate": "Tickets validate",
  "waitlist:manage": "Waitlist manage",
};

export function getServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function getAnonClient(accessToken: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    return null;
  }

  return createClient(supabaseUrl, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

export function getRoleName(role: AdminRole) {
  if (role === "box-office") {
    return adminRoleLabels["box-office-staff"];
  }

  return adminRoleLabels[role];
}

export function getAdminRoleFromName(
  name: string | null | undefined,
): AdminRole {
  const matchedRole = Object.entries(adminRoleLabels).find(
    ([, label]) => label.toLowerCase() === name?.trim().toLowerCase(),
  )?.[0] as AdminRole | undefined;

  return matchedRole ?? "venue-manager";
}

export function getRolePermissions(row: RoleRow | null | undefined) {
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

export async function getRequestingUser(request: Request) {
  const accessToken = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");

  if (!accessToken) {
    return null;
  }

  const anonClient = getAnonClient(accessToken);

  if (!anonClient) {
    return null;
  }

  const { data, error } = await anonClient.auth.getUser();

  if (error) {
    console.error("[Zingara API] Failed to resolve requesting user", error);
    return null;
  }

  return data.user;
}

export async function getRolesWithPermissions(
  serviceClient: NonNullable<ReturnType<typeof getServiceClient>>,
) {
  const { data, error } = await serviceClient
    .from("roles")
    .select("id,name,description,role_permissions(permissions(key))")
    .order("name", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as RoleRow[];
}

export async function ensureDefaultPermissions(
  serviceClient: NonNullable<ReturnType<typeof getServiceClient>>,
) {
  const permissionRows = Object.entries(permissionLabels).map(
    ([key, description]) => ({
      description,
      key,
    }),
  );

  const { error } = await serviceClient
    .from("permissions")
    .upsert(permissionRows, { onConflict: "key" });

  if (error) {
    throw error;
  }

  const { data, error: loadError } = await serviceClient
    .from("permissions")
    .select("id,key");

  if (loadError) {
    throw loadError;
  }

  return (data ?? []) as Array<{ id: string; key: Permission }>;
}

export async function ensureDefaultRoles(
  serviceClient: NonNullable<ReturnType<typeof getServiceClient>>,
) {
  let roles = await getRolesWithPermissions(serviceClient);

  if (roles.length === 0) {
    const { error } = await serviceClient.from("roles").insert(
      defaultRoleSeeds.map((seed) => ({
        description: seed.description,
        name: getRoleName(seed.role),
      })),
    );

    if (error) {
      throw error;
    }

    roles = await getRolesWithPermissions(serviceClient);
  }

  const permissions = await ensureDefaultPermissions(serviceClient);
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
    const { error } = await serviceClient
      .from("role_permissions")
      .upsert(rolePermissionsRows, { onConflict: "role_id,permission_id" });

    if (error) {
      throw error;
    }
  }

  return getRolesWithPermissions(serviceClient);
}

export async function requireActiveStaff(request: Request) {
  const serviceClient = getServiceClient();

  if (!serviceClient) {
    return {
      error: Response.json(
        { error: "Supabase service role is not configured." },
        { status: 500 },
      ),
      serviceClient: null,
      staffProfile: null,
      user: null,
    };
  }

  const user = await getRequestingUser(request);

  if (!user) {
    return {
      error: Response.json({ error: "Unauthorized." }, { status: 401 }),
      serviceClient,
      staffProfile: null,
      user: null,
    };
  }

  const { data, error } = await serviceClient
    .from("staff_profiles")
    .select("id,user_id,full_name,email,role_id,active,venue_scope,roles(id,name,description,role_permissions(permissions(key)))")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[Zingara API] Failed to load staff profile", error);

    return {
      error: Response.json(
        { error: "Staff profile could not be loaded." },
        { status: 500 },
      ),
      serviceClient,
      staffProfile: null,
      user,
    };
  }

  const staffProfile = data as StaffProfileRow | null;

  if (!staffProfile?.active) {
    return {
      error: Response.json(
        { error: "An active staff profile is required." },
        { status: 403 },
      ),
      serviceClient,
      staffProfile,
      user,
    };
  }

  return {
    error: null,
    serviceClient,
    staffProfile,
    user,
  };
}

export function isSuperAdminProfile(profile: StaffProfileRow | null) {
  const role = Array.isArray(profile?.roles)
    ? profile?.roles[0]
    : profile?.roles;

  return getAdminRoleFromName(role?.name) === "super-admin";
}

export function staffProfileToSession(row: StaffProfileRow, user: User) {
  const role = Array.isArray(row.roles) ? row.roles[0] : row.roles;
  const adminRole = getAdminRoleFromName(role?.name);

  return {
    email: row.email,
    id: user.id,
    name: row.full_name,
    permissions: getRolePermissions(role),
    role: adminRole,
    username: row.email,
    venueId: row.venue_scope[0] ?? "zingara-cape-town",
  };
}
