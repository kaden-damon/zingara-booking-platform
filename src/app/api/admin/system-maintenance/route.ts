import {
  loadPlatformMaintenance,
  normalizePlatformMaintenanceConfig,
  validatePlatformMaintenanceConfig,
  type PlatformMaintenanceConfig,
} from "@/lib/platformMaintenance";
import {
  getAdminRoleFromName,
  isSuperAdminProfile,
  requireActiveStaff,
} from "@/lib/supabase/serverAdmin";

export const dynamic = "force-dynamic";

function getRoleName(
  profile: NonNullable<
    Awaited<ReturnType<typeof requireActiveStaff>>["staffProfile"]
  >,
) {
  const role = Array.isArray(profile.roles) ? profile.roles[0] : profile.roles;
  return getAdminRoleFromName(role?.name);
}

export async function GET(request: Request) {
  const auth = await requireActiveStaff(request);

  if (auth.error || !auth.serviceClient || !auth.staffProfile) {
    return auth.error;
  }

  try {
    const state = await loadPlatformMaintenance(auth.serviceClient);
    return Response.json({
      ...state,
      canEdit: isSuperAdminProfile(auth.staffProfile),
    });
  } catch (error) {
    console.error("[Zingara Maintenance] Admin status load failed", error);
    return Response.json(
      { error: "Maintenance status could not be loaded." },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  const auth = await requireActiveStaff(request);

  if (
    auth.error ||
    !auth.serviceClient ||
    !auth.staffProfile ||
    !auth.user
  ) {
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
      confirmed?: boolean;
      config?: PlatformMaintenanceConfig;
      revision?: number;
    };

    if (body.confirmed !== true) {
      return Response.json(
        { error: "Explicit maintenance confirmation is required." },
        { status: 400 },
      );
    }

    const validationError = validatePlatformMaintenanceConfig(body.config);

    if (validationError) {
      return Response.json({ error: validationError }, { status: 400 });
    }

    const config = normalizePlatformMaintenanceConfig(body.config);
    const { data, error } = await auth.serviceClient.rpc(
      "save_system_maintenance_atomic",
      {
        p_actor_auth_user_id: auth.user.id,
        p_actor_location_scope: auth.staffProfile.venue_scope ?? [],
        p_actor_name: auth.staffProfile.full_name,
        p_actor_role: getRoleName(auth.staffProfile),
        p_actor_staff_profile_id: auth.staffProfile.id,
        p_config: config,
        p_expected_revision: body.revision ?? 0,
        p_request_id:
          request.headers.get("x-vercel-id") ??
          request.headers.get("x-request-id") ??
          crypto.randomUUID(),
        p_user_agent: request.headers.get("user-agent"),
      },
    );

    if (error) {
      if (error.message.includes("STALE_MAINTENANCE_REVISION")) {
        return Response.json(
          { error: "Maintenance state changed. Reload and review it again." },
          { status: 409 },
        );
      }
      throw error;
    }

    const result = data as { config?: unknown; revision?: number } | null;
    return Response.json({
      config: normalizePlatformMaintenanceConfig(result?.config ?? config),
      revision: result?.revision ?? (body.revision ?? 0) + 1,
    });
  } catch (error) {
    console.error("[Zingara Maintenance] Save failed", error);
    return Response.json(
      { error: "Maintenance configuration could not be saved." },
      { status: 500 },
    );
  }
}
