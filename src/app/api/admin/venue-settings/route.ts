import {
  type DemoVenueSettings,
  defaultVenueSettings,
  normalizeVenueSettings,
  showLocationOptions,
} from "@/lib/zingaraDemo";
import { isValidExperienceTimes } from "@/lib/experienceTimes";
import {
  getServiceClient,
  isSuperAdminProfile,
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
  return normalizeVenueSettings({
    ...(row.settings ?? {}),
    venueId: row.venue_key || row.settings?.venueId || defaultVenueKey,
    venueName: row.name || row.settings?.venueName || defaultVenueSettings.venueName,
  });
}

const configurableZones = [
  "golden-circle",
  "middle-ring",
  "royal-booths",
  "royal-balcony",
] as const;

function normalizeInventoryZone(section: string | null) {
  const value = section?.trim().toLowerCase();

  if (value === "golden circle" || value === "golden-circle") return "golden-circle";
  if (value === "middle ring" || value === "middle-ring") return "middle-ring";
  if (["private booths", "royal booths", "royal-booths"].includes(value ?? "")) return "royal-booths";
  if (value === "royal balcony" || value === "royal-balcony") return "royal-balcony";
  return null;
}

function validateConfiguration(
  settings: DemoVenueSettings,
  physicalCounts: Record<(typeof configurableZones)[number], number>,
) {
  const knownZoneIds = new Set([...configurableZones, "elevated-stage"]);
  if (Object.keys(settings.zonePricing).some((zoneId) => !knownZoneIds.has(zoneId as (typeof configurableZones)[number] | "elevated-stage"))) {
    return "Venue configuration contains an unknown seating zone.";
  }

  for (const location of showLocationOptions) {
    const publicBookings =
      settings.operationalSettings.publicBookings[location.value];

    if (!publicBookings || typeof publicBookings.enabled !== "boolean") {
      return `Public booking configuration is required for ${location.city}.`;
    }

    if (
      publicBookings.opensAt &&
      !Number.isFinite(Date.parse(publicBookings.opensAt))
    ) {
      return `Enter a valid public booking opening time for ${location.city}.`;
    }

    if (
      typeof publicBookings.sameDayCutoffEnabled !== "boolean" ||
      !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(publicBookings.sameDayCutoffTime)
    ) {
      return `Enter a valid same-day booking cutoff for ${location.city}.`;
    }

    const corporateHold =
      settings.operationalSettings.corporatePaymentHolds[location.value];
    const corporateRecipient =
      settings.operationalSettings.corporateEnquiryRecipients[location.value];
    const friendsAndFamily =
      settings.operationalSettings.friendsAndFamily[location.value];
    const experienceTimes =
      settings.operationalSettings.customerExperienceTimes[location.value];

    if (!experienceTimes || !isValidExperienceTimes(experienceTimes)) {
      return `Enter valid, sequential Customer Experience Times for ${location.city}.`;
    }

    if (
      !corporateRecipient ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(corporateRecipient)
    ) {
      return `Enter a valid Corporate enquiry email for ${location.city}.`;
    }

    if (
      !corporateHold ||
      typeof corporateHold.enabled !== "boolean" ||
      !Number.isInteger(corporateHold.durationDays) ||
      corporateHold.durationDays < 1 ||
      corporateHold.durationDays > 90 ||
      !Number.isInteger(corporateHold.reminderDaysBefore) ||
      corporateHold.reminderDaysBefore < 0 ||
      corporateHold.reminderDaysBefore >= corporateHold.durationDays
    ) {
      return `Enter a valid Corporate payment hold for ${location.city}.`;
    }

    if (
      !friendsAndFamily ||
      typeof friendsAndFamily.enabled !== "boolean" ||
      !Number.isFinite(friendsAndFamily.ratePerPerson) ||
      (friendsAndFamily.enabled && friendsAndFamily.ratePerPerson <= 0)
    ) {
      return `Enter a valid Friends & Family rate for ${location.city}.`;
    }
  }

  for (const zoneId of configurableZones) {
    const zone = settings.zonePricing[zoneId];

    if (!zone || !Number.isFinite(zone.price) || zone.price <= 0) {
      return "Each zone requires a positive price.";
    }
    if (!Number.isFinite(zone.depositPercentage) || zone.depositPercentage < 0 || zone.depositPercentage > 100) {
      return "Deposit percentages must be between 0 and 100.";
    }
    if (!Number.isFinite(Number(zone.depositAmount)) || Number(zone.depositAmount) <= 0) {
      return "Fixed deposit amounts must be positive.";
    }
    if (!zone.depositMode || !["fixed", "percentage"].includes(zone.depositMode)) {
      return "Select either fixed or percentage deposit mode for every zone.";
    }
    if (!Number.isInteger(zone.maxSeats) || Number(zone.maxSeats) <= 0) {
      return "Maximum seats must be a positive whole number.";
    }
    if (!Number.isInteger(zone.maxTables) || Number(zone.maxTables) <= 0) {
      return "Maximum tables must be a positive whole number.";
    }
    if (Number(zone.maxTables) > physicalCounts[zoneId]) {
      return `Maximum tables for ${zoneId} cannot exceed the ${physicalCounts[zoneId]} physical tables in inventory.`;
    }
  }

  return null;
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

export async function GET(request: Request) {
  const auth = await requireActiveStaff(request);

  if (auth.error || !auth.serviceClient) {
    return auth.error;
  }

  try {
    const serviceClient = auth.serviceClient;
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

  if (!isSuperAdminProfile(auth.staffProfile)) {
    return Response.json(
      { error: "Super Admin access is required." },
      { status: 403 },
    );
  }

  try {
    const body = (await request.json()) as { settings?: DemoVenueSettings };
    const settings = body.settings ? normalizeVenueSettings(body.settings) : null;

    if (!settings) {
      return Response.json({ error: "Venue settings are required." }, { status: 400 });
    }

    const { data: venueTables, error: inventoryError } = await auth.serviceClient
      .from("venue_tables")
      .select("section,is_physical")
      .eq("is_physical", true);

    if (inventoryError) {
      throw inventoryError;
    }

    const physicalCounts = Object.fromEntries(
      configurableZones.map((zoneId) => [zoneId, 0]),
    ) as Record<(typeof configurableZones)[number], number>;

    for (const table of venueTables ?? []) {
      const zoneId = normalizeInventoryZone(table.section);
      if (zoneId) physicalCounts[zoneId] += 1;
    }

    const validationError = validateConfiguration(settings, physicalCounts);
    if (validationError) {
      return Response.json({ error: validationError }, { status: 400 });
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
