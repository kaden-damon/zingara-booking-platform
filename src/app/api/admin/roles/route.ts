import {
  type AdminRole,
} from "@/lib/zingaraAccess";
import {
  ensureDefaultRoles,
  getAdminRoleFromName,
  getRoleName,
  getRolesWithPermissions,
  getServiceClient,
  requireActiveStaff,
} from "@/lib/supabase/serverAdmin";

export const dynamic = "force-dynamic";

function toStaffManagementRole(row: { id: string; name: string }) {
  return {
    id: row.id,
    name: row.name,
    role: getAdminRoleFromName(row.name),
  };
}

async function getRoleId(role: AdminRole) {
  const serviceClient = getServiceClient();

  if (!serviceClient) {
    return undefined;
  }

  const roles = await ensureDefaultRoles(serviceClient);
  const roleName = getRoleName(role);

  return roles.find(
    (currentRole) =>
      currentRole.name.trim().toLowerCase() === roleName.toLowerCase(),
  )?.id;
}

export async function GET() {
  const serviceClient = getServiceClient();

  if (!serviceClient) {
    return Response.json(
      { error: "Supabase service role is not configured." },
      { status: 500 },
    );
  }

  try {
    const roles = await ensureDefaultRoles(serviceClient);

    return Response.json({ roles: roles.map(toStaffManagementRole) });
  } catch (error) {
    console.error("[Zingara API] Failed to load roles", error);

    return Response.json({ error: "Roles could not be loaded." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireActiveStaff(request);

  if (auth.error || !auth.serviceClient) {
    return auth.error;
  }

  try {
    const body = (await request.json()) as { action?: "resolve-role-id"; role?: AdminRole };

    if (body.action !== "resolve-role-id" || !body.role) {
      return Response.json({ error: "Unsupported role action." }, { status: 400 });
    }

    const roleId = await getRoleId(body.role);
    const roles = await getRolesWithPermissions(auth.serviceClient);

    return Response.json({
      roleId,
      roles: roles.map(toStaffManagementRole),
    });
  } catch (error) {
    console.error("[Zingara API] Failed to resolve role", error);

    return Response.json({ error: "Role could not be resolved." }, { status: 500 });
  }
}
