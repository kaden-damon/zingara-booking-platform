import { createClient } from "@supabase/supabase-js";
import {
  type AdminRole,
  adminRoleLabels,
} from "@/lib/zingaraAccess";

type StaffInvitationRequest = {
  action?: "create-profile" | "create-user";
  email?: string;
  fullName?: string;
  role?: AdminRole;
  venueScope?: string[];
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

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

function getServiceClient() {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function getAnonClient(accessToken: string) {
  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
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

async function getRoleId(
  serviceClient: NonNullable<ReturnType<typeof getServiceClient>>,
  role: AdminRole,
) {
  const { data, error } = await serviceClient
    .from("roles")
    .select("id,name")
    .eq("name", getRoleName(role))
    .maybeSingle();

  if (error) {
    console.error("[Zingara Staff Invitations] Failed to resolve role", error);
    return null;
  }

  return (data as { id?: string } | null)?.id ?? null;
}

async function getRequestingUser(accessToken: string) {
  const anonClient = getAnonClient(accessToken);

  if (!anonClient) {
    return null;
  }

  const { data, error } = await anonClient.auth.getUser();

  if (error) {
    console.error(
      "[Zingara Staff Invitations] Failed to resolve requesting user",
      error,
    );
    return null;
  }

  return data.user;
}

async function isSuperAdmin(
  serviceClient: NonNullable<ReturnType<typeof getServiceClient>>,
  user: NonNullable<Awaited<ReturnType<typeof getRequestingUser>>>,
) {
  console.log("[Staff Invitations] User:", {
    email: user.email,
    id: user.id,
  });

  const { data, error } = await serviceClient
    .from("staff_profiles")
    .select("id,user_id,email,role_id,active,roles(id,name)")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error(
      "[Zingara Staff Invitations] Failed to verify super admin",
      error,
    );
    return false;
  }

  let profile = data as
    | {
        email?: string;
        id?: string;
        active?: boolean;
        role_id?: string | null;
        roles?:
          | { id?: string; name?: string }
          | Array<{ id?: string; name?: string }>
          | null;
        user_id?: string;
      }
    | null;

  if (!profile && user.email) {
    const { data: emailProfile, error: emailProfileError } =
      await serviceClient
        .from("staff_profiles")
        .select("id,user_id,email,role_id,active,roles(id,name)")
        .eq("email", user.email.trim().toLowerCase())
        .maybeSingle();

    if (emailProfileError) {
      console.error(
        "[Zingara Staff Invitations] Failed to verify super admin by email",
        emailProfileError,
      );
    } else {
      profile = emailProfile as typeof profile;
    }
  }

  const role = Array.isArray(profile?.roles)
    ? profile?.roles[0]
    : profile?.roles;
  let roleName = role?.name ?? null;

  if (!roleName && profile?.role_id) {
    const { data: roleRow, error: roleError } = await serviceClient
      .from("roles")
      .select("id,name")
      .eq("id", profile.role_id)
      .maybeSingle();

    if (roleError) {
      console.error(
        "[Zingara Staff Invitations] Failed to resolve staff profile role",
        roleError,
      );
    } else {
      roleName = (roleRow as { name?: string } | null)?.name ?? null;
    }
  }
  const resolvedRole = getAdminRoleFromName(roleName);
  const isAllowed = Boolean(profile?.active && resolvedRole === "super-admin");
  const denialReason = isAllowed
    ? ""
    : !profile
      ? "No staff profile found for authenticated user."
      : !profile.active
        ? "Staff profile is inactive."
        : `Staff profile role is ${resolvedRole}, not super-admin.`;

  console.log("[Staff Invitations] Profile:", {
    active: profile?.active ?? null,
    email: profile?.email ?? null,
    id: profile?.id ?? null,
    roleId: profile?.role_id ?? null,
    userId: profile?.user_id ?? null,
  });
  console.log("[Staff Invitations] Role:", {
    resolvedRole,
    roleName,
  });
  console.log(
    "[Staff Invitations] Denied because:",
    denialReason || "Access granted.",
  );

  return isAllowed;
}

async function findExistingAuthUser(
  serviceClient: NonNullable<ReturnType<typeof getServiceClient>>,
  email: string,
) {
  const { data, error } = await serviceClient.auth.admin.listUsers();

  if (error) {
    console.error(
      "[Zingara Staff Invitations] Failed to list auth users",
      error,
    );
    return null;
  }

  return (
    data.users.find(
      (user) => user.email?.trim().toLowerCase() === email,
    ) ?? null
  );
}

async function createOrInviteAuthUser(
  serviceClient: NonNullable<ReturnType<typeof getServiceClient>>,
  input: Required<
    Pick<StaffInvitationRequest, "email" | "fullName" | "role">
  > & { venueScope: string[] },
) {
  const existingUser = await findExistingAuthUser(serviceClient, input.email);

  if (existingUser) {
    return existingUser;
  }

  const { data, error } = await serviceClient.auth.admin.inviteUserByEmail(
    input.email,
    {
      data: {
        name: input.fullName,
        role: input.role,
        venueId: input.venueScope[0] ?? "",
      },
    },
  );

  if (error) {
    console.error(
      "[Zingara Staff Invitations] Failed to invite auth user",
      error,
    );
    return null;
  }

  return data.user;
}

async function createLinkedStaffProfile(
  serviceClient: NonNullable<ReturnType<typeof getServiceClient>>,
  input: Required<
    Pick<StaffInvitationRequest, "email" | "fullName" | "role">
  > & { venueScope: string[]; userId: string },
) {
  const roleId = await getRoleId(serviceClient, input.role);

  if (!roleId) {
    return null;
  }

  const profilePayload = {
    active: true,
    email: input.email,
    full_name: input.fullName,
    role_id: roleId,
    updated_at: new Date().toISOString(),
    user_id: input.userId,
    venue_scope: input.venueScope,
  };
  const { data, error } = await serviceClient
    .from("staff_profiles")
    .upsert(profilePayload, { onConflict: "user_id" })
    .select("id,user_id,full_name,email,role_id,active,venue_scope,roles(id,name)")
    .maybeSingle();

  if (error) {
    console.error(
      "[Zingara Staff Invitations] Failed to create staff profile",
      error,
    );
    return null;
  }

  const profile = data as
    | {
        active: boolean;
        email: string;
        full_name: string;
        id: string;
        role_id: string | null;
        roles?: { id: string; name: string } | Array<{ id: string; name: string }> | null;
        user_id: string;
        venue_scope: string[];
      }
    | null;
  const role = Array.isArray(profile?.roles)
    ? profile?.roles[0]
    : profile?.roles;

  return profile
    ? {
        active: profile.active,
        email: profile.email,
        id: profile.id,
        name: profile.full_name,
        role: getAdminRoleFromName(role?.name),
        roleId: profile.role_id,
        userId: profile.user_id,
        venueScope: profile.venue_scope ?? [],
      }
    : null;
}

export async function POST(request: Request) {
  console.log(
    "[Staff Invitations] Service role configured:",
    Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
  );
  const serviceClient = getServiceClient();

  if (!serviceClient) {
    return Response.json(
      { error: "Supabase service role is not configured." },
      { status: 500 },
    );
  }

  const accessToken = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");
  const requestingUser = accessToken
    ? await getRequestingUser(accessToken)
    : null;

  if (!requestingUser) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!(await isSuperAdmin(serviceClient, requestingUser))) {
    return Response.json(
      { error: "Super Admin access is required." },
      { status: 403 },
    );
  }

  const body = (await request.json()) as StaffInvitationRequest;
  const email = body.email?.trim().toLowerCase();
  const fullName = body.fullName?.trim();
  const role = body.role;
  const venueScope = body.venueScope?.filter(Boolean) ?? [];

  if (!email || !fullName || !role || !adminRoleLabels[role]) {
    return Response.json(
      { error: "Name, email, and role are required." },
      { status: 400 },
    );
  }

  const authUser = await createOrInviteAuthUser(serviceClient, {
    email,
    fullName,
    role,
    venueScope,
  });

  if (!authUser) {
    return Response.json(
      { error: "Supabase Auth user could not be created." },
      { status: 500 },
    );
  }

  const profile = await createLinkedStaffProfile(serviceClient, {
    email,
    fullName,
    role,
    userId: authUser.id,
    venueScope,
  });

  if (!profile) {
    return Response.json(
      { error: "Staff profile could not be created." },
      { status: 500 },
    );
  }

  return Response.json({ profile });
}
