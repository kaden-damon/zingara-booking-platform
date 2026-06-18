import {
  type DemoVenueSettings,
  defaultVenueSettings,
} from "@/lib/zingaraDemo";
import {
  getServiceClient,
  requireActiveStaff,
} from "@/lib/supabase/serverAdmin";

export const dynamic = "force-dynamic";

type SupabaseVenueSettingsRow = {
  branding: Record<string, unknown> | null;
  id: string;
  name: string;
  operational_config: Record<string, unknown> | null;
  settings: DemoVenueSettings | null;
  updated_at?: string;
  venue_key: string;
};

const defaultVenueKey = defaultVenueSettings.venueId || "zingara-cape-town";

function getVenueKey(settings: DemoVenueSettings) {
  return settings.venueId || defaultVenueKey;
}

function toVenueSettings(row: SupabaseVenueSettingsRow) {
  return {
    ...defaultVenueSettings,
    ...(row.settings ?? {}),
    venueId: row.venue_key || row.settings?.venueId || defaultVenueKey,
    venueName: row.name || row.settings?.venueName || defaultVenueSettings.venueName,
  };
}

function toSupabaseVenueSettings(settings: DemoVenueSettings) {
  return {
    branding: {
      brandTitle: settings.brandTitle,
      faviconUrl: settings.faviconUrl,
      logoUrl: settings.logoUrl,
      showBranding: settings.showBranding,
      showTitle: settings.showTitle,
      theme: settings.theme,
      ticketBranding: settings.ticketBranding,
      typography: settings.typography,
    },
    name: settings.venueName,
    operational_config: {
      emailSender: settings.emailSender,
      operationalMessaging: settings.operationalMessaging,
      operationalSettings: settings.operationalSettings,
      socialLinks: settings.socialLinks,
      supportContact: settings.supportContact,
      zonePricing: settings.zonePricing,
    },
    settings,
    venue_key: getVenueKey(settings),
  };
}

async function loadVenueSettings(settingsKey = defaultVenueKey) {
  const serviceClient = getServiceClient();

  if (!serviceClient) {
    throw new Error("Supabase service role is not configured.");
  }

  const { data, error } = await serviceClient
    .from("venue_settings")
    .select("id,venue_key,name,settings,branding,operational_config,updated_at")
    .eq("venue_key", settingsKey)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? toVenueSettings(data as SupabaseVenueSettingsRow) : null;
}

export async function GET() {
  try {
    const serviceClient = getServiceClient();
    const settings = await loadVenueSettings();

    if (!settings && serviceClient) {
      const { error } = await serviceClient
        .from("venue_settings")
        .upsert(toSupabaseVenueSettings(defaultVenueSettings), {
          onConflict: "venue_key",
        });

      if (error) {
        throw error;
      }

      return Response.json({ settings: await loadVenueSettings() });
    }

    return Response.json({ settings });
  } catch (error) {
    console.error("[Zingara API] Failed to load venue settings", error);

    return Response.json(
      { error: "Venue settings could not be loaded." },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  const auth = await requireActiveStaff(request);

  if (auth.error || !auth.serviceClient) {
    return auth.error;
  }

  try {
    const body = (await request.json()) as { settings?: DemoVenueSettings };
    const settings = body.settings;

    if (!settings) {
      return Response.json({ error: "Venue settings are required." }, { status: 400 });
    }

    const { error } = await auth.serviceClient
      .from("venue_settings")
      .upsert(toSupabaseVenueSettings(settings), {
        onConflict: "venue_key",
      });

    if (error) {
      throw error;
    }

    return Response.json({ settings: await loadVenueSettings(getVenueKey(settings)) });
  } catch (error) {
    console.error("[Zingara API] Failed to save venue settings", error);

    return Response.json(
      { error: "Venue settings could not be saved." },
      { status: 500 },
    );
  }
}
