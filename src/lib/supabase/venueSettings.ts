import {
  type DemoVenueSettings,
  defaultVenueSettings,
  getStoredVenueSettings,
  normalizeVenueSettings,
  storeVenueSettings,
} from "@/lib/zingaraDemo";
import { fetchSupabaseApi } from "./apiClient";

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
  return normalizeVenueSettings({
    ...(row.settings ?? {}),
    venueId: row.venue_key || row.settings?.venueId || defaultVenueKey,
    venueName: row.name || row.settings?.venueName || defaultVenueSettings.venueName,
  });
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
  const fallbackSettings = getStoredVenueSettings();

  try {
    const payload = await fetchSupabaseApi<{
      settings: DemoVenueSettings | null;
    }>("/api/admin/venue-settings");

    return payload.settings ?? fallbackSettings;
  } catch (error) {
    console.error("[Zingara Supabase] Failed to load venue settings", error);
    return fallbackSettings;
  }
}

export async function getPublicVenueSettings() {
  const fallbackSettings = getStoredVenueSettings();

  try {
    const response = await fetch("/api/venue-settings", {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error("Venue settings could not be loaded.");
    }

    const payload = (await response.json()) as {
      settings?: DemoVenueSettings | null;
    };

    return payload.settings
      ? normalizeVenueSettings(payload.settings)
      : fallbackSettings;
  } catch (error) {
    console.error("[Zingara Supabase] Failed to load public venue settings", error);
    return fallbackSettings;
  }
}

async function persistVenueSettingsToSupabase(settings: DemoVenueSettings) {
  const payload = await fetchSupabaseApi<{
    settings: DemoVenueSettings | null;
  }>("/api/admin/venue-settings", {
    body: { settings },
    method: "PUT",
  });

  return payload.settings ?? settings;
}

export async function saveVenueSettings(settings: DemoVenueSettings) {
  const persistedSettings = await persistVenueSettingsToSupabase(settings);
  storeVenueSettings(persistedSettings);

  return persistedSettings;
}
