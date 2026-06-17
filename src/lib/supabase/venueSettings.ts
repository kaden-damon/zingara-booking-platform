import {
  type DemoVenueSettings,
  defaultVenueSettings,
  getStoredVenueSettings,
  storeVenueSettings,
} from "@/lib/zingaraDemo";
import { getSupabaseClient } from "./client";

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

export async function getVenueSettings() {
  const supabase = getSupabaseClient();
  const fallbackSettings = getStoredVenueSettings();

  if (!supabase) {
    return fallbackSettings;
  }

  const { data, error } = await supabase
    .from("venue_settings")
    .select("id,venue_key,name,settings,branding,operational_config,updated_at")
    .eq("venue_key", getVenueKey(fallbackSettings))
    .maybeSingle();

  if (error) {
    console.error("[Zingara Supabase] Failed to load venue settings", error);
    return fallbackSettings;
  }

  if (!data) {
    await persistVenueSettingsToSupabase(fallbackSettings);

    return fallbackSettings;
  }

  return toVenueSettings(data as SupabaseVenueSettingsRow);
}

async function persistVenueSettingsToSupabase(settings: DemoVenueSettings) {
  const supabase = getSupabaseClient();

  if (!supabase) {
    return settings;
  }

  const { error } = await supabase
    .from("venue_settings")
    .upsert(toSupabaseVenueSettings(settings), {
      onConflict: "venue_key",
    });

  if (error) {
    console.error("[Zingara Supabase] Failed to persist venue settings", error);
    return settings;
  }

  return settings;
}

export async function saveVenueSettings(settings: DemoVenueSettings) {
  storeVenueSettings(settings);

  return persistVenueSettingsToSupabase(settings);
}
