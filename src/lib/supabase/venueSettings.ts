import {
  type DemoVenueSettings,
  defaultVenueSettings,
  getStoredVenueSettings,
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

async function persistVenueSettingsToSupabase(settings: DemoVenueSettings) {
  try {
    const payload = await fetchSupabaseApi<{
      settings: DemoVenueSettings | null;
    }>("/api/admin/venue-settings", {
      body: { settings },
      method: "PUT",
    });

    return payload.settings ?? settings;
  } catch (error) {
    console.error("[Zingara Supabase] Failed to persist venue settings", error);
    return settings;
  }
}

export async function saveVenueSettings(settings: DemoVenueSettings) {
  storeVenueSettings(settings);

  return persistVenueSettingsToSupabase(settings);
}
