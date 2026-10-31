import { secretGuestListFeatureKey } from "@/lib/secretGuestListFeature";
import {
  getRolePermissions,
  requireActiveStaff,
} from "@/lib/supabase/serverAdmin";
import { recordAuditEvent } from "@/lib/supabase/serverAudit";

export const dynamic = "force-dynamic";

function roleOf(
  profile: NonNullable<
    Awaited<ReturnType<typeof requireActiveStaff>>["staffProfile"]
  >,
) {
  return Array.isArray(profile.roles) ? profile.roles[0] : profile.roles;
}

async function authorize(request: Request) {
  const auth = await requireActiveStaff(request);

  if (auth.error || !auth.serviceClient || !auth.staffProfile) {
    return { error: auth.error };
  }

  if (!getRolePermissions(roleOf(auth.staffProfile)).includes("settings:manage")) {
    return {
      error: Response.json(
        { error: "Management settings access is required." },
        { status: 403 },
      ),
    };
  }

  return { auth };
}

async function loadConfiguration(
  client: NonNullable<
    Awaited<ReturnType<typeof requireActiveStaff>>["serviceClient"]
  >,
) {
  const { data, error } = await client
    .from("workflow_configurations")
    .select("id,enabled,updated_at")
    .eq("workflow_key", secretGuestListFeatureKey)
    .single();

  if (error) throw error;

  return data;
}

export async function GET(request: Request) {
  const result = await authorize(request);
  if ("error" in result) return result.error;

  try {
    const configuration = await loadConfiguration(result.auth.serviceClient);
    return Response.json({
      enabled: configuration.enabled,
      updatedAt: configuration.updated_at,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[Secret Guest List] Feature status could not be loaded", error);
    return Response.json(
      { error: "The Secret Guest List setting could not be loaded." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const result = await authorize(request);
  if ("error" in result) return result.error;
  const { auth } = result;

  if (!auth.user) {
    return Response.json({ error: "Staff authentication is required." }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => null)) as {
      enabled?: unknown;
    } | null;

    if (typeof body?.enabled !== "boolean") {
      return Response.json(
        { error: "Choose whether The Secret Guest List is on or off." },
        { status: 400 },
      );
    }

    const before = await loadConfiguration(auth.serviceClient);
    const { data, error } = await auth.serviceClient
      .from("workflow_configurations")
      .update({
        activated_at: body.enabled ? new Date().toISOString() : null,
        enabled: body.enabled,
        updated_at: new Date().toISOString(),
        updated_by: auth.user.id,
      })
      .eq("id", before.id)
      .select("enabled,updated_at")
      .single();

    if (error) throw error;

    await recordAuditEvent(
      auth.serviceClient,
      auth.staffProfile,
      auth.user,
      {
        action: "secret_guest_list.feature_status_updated",
        afterValues: { enabled: data.enabled },
        beforeValues: { enabled: before.enabled },
        entityId: before.id,
        entityReference: secretGuestListFeatureKey,
        entityType: "workflow",
        outcome: "success",
        request,
        sourceArea: "settings",
      },
    );

    return Response.json(
      { enabled: data.enabled, updatedAt: data.updated_at },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("[Secret Guest List] Feature status could not be saved", error);
    return Response.json(
      { error: "The Secret Guest List setting could not be saved." },
      { status: 500 },
    );
  }
}
