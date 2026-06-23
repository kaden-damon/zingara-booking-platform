import { defaultVenueSettings } from "@/lib/zingaraDemo";
import { requireActiveStaff } from "@/lib/supabase/serverAdmin";
import { type StaffNotificationRecord } from "@/lib/supabase/staffPush";

export const dynamic = "force-dynamic";

const defaultVenueKey = defaultVenueSettings.venueId || "zingara-cape-town";

type VenueSettingsRow = {
  branding: Record<string, unknown> | null;
  name: string | null;
  operational_config: Record<string, unknown> | null;
  settings: typeof defaultVenueSettings | null;
  venue_key: string;
};

function getStaffNotifications(row: VenueSettingsRow | null) {
  const notifications = row?.operational_config?.staffNotifications;

  return Array.isArray(notifications)
    ? (notifications as StaffNotificationRecord[])
    : [];
}

async function loadVenueSettingsRow(
  serviceClient: NonNullable<
    Awaited<ReturnType<typeof requireActiveStaff>>["serviceClient"]
  >,
) {
  const { data, error } = await serviceClient
    .from("venue_settings")
    .select("venue_key,name,settings,branding,operational_config")
    .eq("venue_key", defaultVenueKey)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as VenueSettingsRow | null;
}

async function saveStaffNotifications(
  serviceClient: NonNullable<
    Awaited<ReturnType<typeof requireActiveStaff>>["serviceClient"]
  >,
  row: VenueSettingsRow | null,
  notifications: StaffNotificationRecord[],
) {
  const operationalConfig = {
    ...(row?.operational_config ?? {}),
    staffNotifications: notifications,
  };
  const { error } = await serviceClient
    .from("venue_settings")
    .upsert(
      {
        branding: row?.branding ?? {},
        name: row?.name ?? defaultVenueSettings.venueName,
        operational_config: operationalConfig,
        settings: row?.settings ?? defaultVenueSettings,
        venue_key: row?.venue_key ?? defaultVenueKey,
      },
      { onConflict: "venue_key" },
    );

  if (error) {
    throw error;
  }
}

export async function GET(request: Request) {
  const auth = await requireActiveStaff(request);

  if (auth.error || !auth.serviceClient) {
    return auth.error;
  }

  try {
    const row = await loadVenueSettingsRow(auth.serviceClient);

    return Response.json({
      notifications: getStaffNotifications(row),
      userId: auth.user?.id,
    });
  } catch (error) {
    console.error("[Zingara API] Failed to load notifications", error);

    return Response.json(
      { error: "Notifications could not be loaded." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const auth = await requireActiveStaff(request);

  if (auth.error || !auth.serviceClient || !auth.user) {
    return auth.error ?? Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      action?: "mark-all-read" | "mark-read";
      id?: string;
    };
    const row = await loadVenueSettingsRow(auth.serviceClient);
    const notifications = getStaffNotifications(row);
    const nextNotifications = notifications.map((notification) => {
      if (
        body.action === "mark-all-read" ||
        (body.action === "mark-read" && notification.id === body.id)
      ) {
        return {
          ...notification,
          readBy: Array.from(
            new Set([...(notification.readBy ?? []), auth.user.id]),
          ),
        };
      }

      return notification;
    });

    await saveStaffNotifications(
      auth.serviceClient,
      row,
      nextNotifications,
    );

    return Response.json({
      notifications: nextNotifications,
      userId: auth.user.id,
    });
  } catch (error) {
    console.error("[Zingara API] Failed to update notifications", error);

    return Response.json(
      { error: "Notifications could not be updated." },
      { status: 500 },
    );
  }
}
