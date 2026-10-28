import { normalizeStaffVenueScope } from "@/lib/staffLocations";
import {
  getRolePermissions,
  requireActiveStaff,
} from "@/lib/supabase/serverAdmin";

export const dynamic = "force-dynamic";

type ShowRow = {
  id: string;
  venue: string | null;
};

function normalizeVenue(value: string | null) {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (normalized === "cape-town" || normalized === "cape town") return "cape-town";
  if (normalized === "johannesburg" || normalized === "joburg") return "johannesburg";
  return "";
}

async function authorize(request: Request, showId: string) {
  const auth = await requireActiveStaff(request);
  if (auth.error || !auth.serviceClient || !auth.staffProfile || !auth.user) {
    return { auth, error: auth.error, permissions: [] as string[], show: null };
  }
  const role = Array.isArray(auth.staffProfile.roles)
    ? auth.staffProfile.roles[0]
    : auth.staffProfile.roles;
  const permissions = getRolePermissions(role);
  if (!permissions.includes("bookings:manage") || !permissions.includes("tables:manage")) {
    return {
      auth,
      error: Response.json(
        { error: "Booking and table management access is required." },
        { status: 403 },
      ),
      permissions,
      show: null,
    };
  }

  const { data, error } = await auth.serviceClient
    .from("shows")
    .select("id,venue")
    .eq("id", showId)
    .maybeSingle();
  if (error) throw error;
  const show = data as ShowRow | null;
  if (!show) {
    return {
      auth,
      error: Response.json({ error: "Show not found." }, { status: 404 }),
      permissions,
      show: null,
    };
  }

  const scope = normalizeStaffVenueScope(auth.staffProfile.venue_scope ?? []);
  const venue = normalizeVenue(show.venue);
  if (!venue || (!scope.includes("all") && !scope.includes(venue))) {
    return {
      auth,
      error: Response.json({ error: "This show is outside your venue access." }, { status: 403 }),
      permissions,
      show: null,
    };
  }
  return { auth, error: null, permissions, show: { ...show, venue } };
}

export async function GET(request: Request) {
  try {
    const showId = new URL(request.url).searchParams.get("showId")?.trim() ?? "";
    if (!showId) {
      return Response.json({ error: "Show is required." }, { status: 400 });
    }
    const access = await authorize(request, showId);
    if (access.error || !access.auth.serviceClient) {
      return access.error ?? Response.json({ error: "Staff access could not be verified." }, { status: 401 });
    }

    const { data, error } = await access.auth.serviceClient.rpc(
      "get_automatic_table_assignment_status",
      { p_show_id: showId },
    );
    if (error) throw error;
    return Response.json({
      ...data,
      canManageGlobal: access.permissions.includes("settings:manage"),
    });
  } catch (error) {
    console.error("[Automatic table assignment] Status failed", error);
    return Response.json(
      { error: "Automatic assignment status could not be loaded." },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as {
      action?: string;
      enabled?: boolean;
      reason?: string;
      reviewReminderDays?: number;
      showId?: string;
      thresholdPercent?: number;
    };
    const showId = body.showId?.trim() ?? "";
    if (!showId) {
      return Response.json({ error: "Show is required." }, { status: 400 });
    }
    const access = await authorize(request, showId);
    if (access.error || !access.auth.serviceClient || !access.auth.staffProfile || !access.auth.user || !access.show) {
      return access.error ?? Response.json({ error: "Staff access could not be verified." }, { status: 401 });
    }

    if (body.action === "global") {
      if (!access.permissions.includes("settings:manage")) {
        return Response.json({ error: "Settings access is required." }, { status: 403 });
      }
      const { error } = await access.auth.serviceClient.rpc(
        "configure_automatic_table_assignment_defaults",
        {
          p_actor_auth_user_id: access.auth.user.id,
          p_actor_staff_profile_id: access.auth.staffProfile.id,
          p_enabled: Boolean(body.enabled),
          p_reason: body.reason?.trim() ?? "",
          p_review_reminder_days: Number(body.reviewReminderDays),
          p_threshold_percent: Number(body.thresholdPercent),
          p_venue: access.show.venue,
        },
      );
      if (error) throw error;
    } else {
      const allowedActions = new Set(["disable", "enable", "pause", "resume", "threshold"]);
      if (!body.action || !allowedActions.has(body.action)) {
        return Response.json({ error: "Unsupported assignment action." }, { status: 400 });
      }
      if (body.action === "resume") {
        const { error } = await access.auth.serviceClient.rpc(
          "resume_and_reconcile_threshold_assignment",
          {
            p_actor_auth_user_id: access.auth.user.id,
            p_actor_staff_profile_id: access.auth.staffProfile.id,
            p_limit: 100,
            p_reason: body.reason?.trim() ?? "",
            p_show_id: showId,
          },
        );
        if (error) throw error;
      } else {
        const { error } = await access.auth.serviceClient.rpc(
          "control_automatic_table_assignment",
          {
            p_action: body.action,
            p_actor_auth_user_id: access.auth.user.id,
            p_actor_staff_profile_id: access.auth.staffProfile.id,
            p_reason: body.reason?.trim() ?? "",
            p_show_id: showId,
            p_threshold_percent:
              body.thresholdPercent === undefined ? null : Number(body.thresholdPercent),
          },
        );
        if (error) throw error;
      }
    }

    const { data, error } = await access.auth.serviceClient.rpc(
      "get_automatic_table_assignment_status",
      { p_show_id: showId },
    );
    if (error) throw error;
    return Response.json({
      ...data,
      canManageGlobal: access.permissions.includes("settings:manage"),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Automatic assignment could not be updated.";
    const known = message.includes("SHOW_LAYOUT_NOT_ELIGIBLE") ||
      message.includes("REASON_REQUIRED") ||
      message.includes("THRESHOLD_INVALID") ||
      message.includes("SHOW_LAYOUT_NOT_ADOPTED") ||
      message.includes("THRESHOLD_OVERRIDE");
    console.error("[Automatic table assignment] Update failed", error);
    return Response.json(
      { error: known ? message.replace(/^.*?message[:=]\s*/i, "") : "Automatic assignment could not be updated." },
      { status: known ? 409 : 500 },
    );
  }
}
