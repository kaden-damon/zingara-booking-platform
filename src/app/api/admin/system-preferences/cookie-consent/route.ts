import {
  getAdminRoleFromName,
  isSuperAdminProfile,
  requireActiveStaff,
} from "@/lib/supabase/serverAdmin";
import {
  defaultCookieConsentConfig,
  getChangedCookieConsentFields,
  normalizeCookieConsentConfig,
  validateCookieConsentConfig,
  type CookieConsentConfig,
} from "@/lib/cookieConsentConfig";

export const dynamic = "force-dynamic";

type PreferenceRow = {
  config: unknown;
  preference_key: string;
  revision: number;
  updated_at: string;
};

function getRoleName(
  staffProfile: NonNullable<
    Awaited<ReturnType<typeof requireActiveStaff>>["staffProfile"]
  >,
) {
  const role = Array.isArray(staffProfile.roles)
    ? staffProfile.roles[0]
    : staffProfile.roles;

  return getAdminRoleFromName(role?.name);
}

async function loadPreference(
  serviceClient: NonNullable<
    Awaited<ReturnType<typeof requireActiveStaff>>["serviceClient"]
  >,
) {
  const { data, error } = await serviceClient
    .from("platform_preferences")
    .select("preference_key,revision,config,updated_at")
    .eq("preference_key", "cookie_privacy")
    .maybeSingle();

  if (error) throw error;
  return data as PreferenceRow | null;
}

export async function GET(request: Request) {
  const auth = await requireActiveStaff(request);

  if (auth.error || !auth.serviceClient || !auth.staffProfile) {
    return auth.error;
  }

  try {
    const row = await loadPreference(auth.serviceClient);

    return Response.json({
      canEdit: isSuperAdminProfile(auth.staffProfile),
      config: normalizeCookieConsentConfig(row?.config),
      revision: row?.revision ?? 0,
      source: row ? "saved" : "defaults",
    });
  } catch (error) {
    console.error("[Zingara Preferences] Failed to load Cookie & Privacy", error);
    return Response.json(
      { error: "Cookie & Privacy preferences could not be loaded." },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  const auth = await requireActiveStaff(request);

  if (auth.error || !auth.serviceClient || !auth.staffProfile || !auth.user) {
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
      config?: CookieConsentConfig;
      consentVersionReset?: boolean;
    };
    const validationError = validateCookieConsentConfig(body.config);

    if (validationError) {
      return Response.json({ error: validationError }, { status: 400 });
    }

    const nextConfig = normalizeCookieConsentConfig(body.config);
    const current = await loadPreference(auth.serviceClient);
    const previousConfig = normalizeCookieConsentConfig(
      current?.config ?? defaultCookieConsentConfig,
    );
    const changedFields = getChangedCookieConsentFields(
      previousConfig,
      nextConfig,
    );

    if (changedFields.length === 0) {
      return Response.json({
        config: previousConfig,
        revision: current?.revision ?? 0,
      });
    }

    const role = getRoleName(auth.staffProfile);
    const requestId = crypto.randomUUID();
    const { data, error } = await auth.serviceClient.rpc(
      "save_platform_preference_atomic",
      {
        p_actor_auth_user_id: auth.user.id,
        p_actor_location_scope: auth.staffProfile.venue_scope ?? [],
        p_actor_name: auth.staffProfile.full_name,
        p_actor_role: role,
        p_actor_staff_profile_id: auth.staffProfile.id,
        p_changed_fields: changedFields,
        p_config: nextConfig,
        p_consent_version_reset: body.consentVersionReset === true,
        p_preference_key: "cookie_privacy",
        p_request_id: requestId,
        p_user_agent: request.headers.get("user-agent"),
      },
    );

    if (error) throw error;

    const result = data as {
      config?: unknown;
      revision?: number;
    } | null;

    return Response.json({
      config: normalizeCookieConsentConfig(result?.config ?? nextConfig),
      revision: result?.revision ?? (current?.revision ?? 0) + 1,
    });
  } catch (error) {
    console.error("[Zingara Preferences] Failed to save Cookie & Privacy", error);
    return Response.json(
      { error: "Cookie & Privacy preferences could not be saved." },
      { status: 500 },
    );
  }
}
