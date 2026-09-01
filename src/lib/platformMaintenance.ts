import type { SupabaseClient } from "@supabase/supabase-js";

export type PublicMaintenanceScope = "bookings" | "full" | "payments";
export type PublicMaintenanceAction = "booking" | "payment";
export type MaintenanceEnquiryStatus = "contacted" | "new" | "resolved";

export type PlatformMaintenanceConfig = {
  public: {
    contactEmail: string;
    enabled: boolean;
    enabledAt: string | null;
    enabledBy: string | null;
    enquiryFormEnabled: boolean;
    heading: string;
    message: string;
    scope: PublicMaintenanceScope;
  };
  staff: {
    enabled: boolean;
    enabledAt: string | null;
    enabledBy: string | null;
    message: string;
  };
};

export const defaultPlatformMaintenanceConfig: PlatformMaintenanceConfig = {
  public: {
    contactEmail: "bookings@zingara.co.za",
    enabled: false,
    enabledAt: null,
    enabledBy: null,
    enquiryFormEnabled: true,
    heading: "ONLINE BOOKINGS TEMPORARILY UNAVAILABLE",
    message:
      "Our online booking system is temporarily unavailable. Our Box Office team can still assist you with your booking enquiry.",
    scope: "full",
  },
  staff: {
    enabled: false,
    enabledAt: null,
    enabledBy: null,
    message:
      "The Zingara Admin platform is temporarily undergoing maintenance. Please try again shortly.",
  },
};

function asObject(value: unknown) {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function textOrDefault(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function nullableText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function normalizePlatformMaintenanceConfig(
  value: unknown,
): PlatformMaintenanceConfig {
  const root = asObject(value);
  const publicValue = asObject(root.public);
  const staffValue = asObject(root.staff);
  const scope = publicValue.scope;

  return {
    public: {
      contactEmail: textOrDefault(
        publicValue.contactEmail,
        defaultPlatformMaintenanceConfig.public.contactEmail,
      ),
      enabled: publicValue.enabled === true,
      enabledAt: nullableText(publicValue.enabledAt),
      enabledBy: nullableText(publicValue.enabledBy),
      enquiryFormEnabled: publicValue.enquiryFormEnabled !== false,
      heading: textOrDefault(
        publicValue.heading,
        defaultPlatformMaintenanceConfig.public.heading,
      ),
      message: textOrDefault(
        publicValue.message,
        defaultPlatformMaintenanceConfig.public.message,
      ),
      scope:
        scope === "bookings" || scope === "payments" || scope === "full"
          ? scope
          : defaultPlatformMaintenanceConfig.public.scope,
    },
    staff: {
      enabled: staffValue.enabled === true,
      enabledAt: nullableText(staffValue.enabledAt),
      enabledBy: nullableText(staffValue.enabledBy),
      message: textOrDefault(
        staffValue.message,
        defaultPlatformMaintenanceConfig.staff.message,
      ),
    },
  };
}

export function validatePlatformMaintenanceConfig(value: unknown) {
  const root = asObject(value);
  const publicValue = asObject(root.public);
  const staffValue = asObject(root.staff);

  if (typeof staffValue.message !== "string" || !staffValue.message.trim()) {
    return "A Staff Maintenance message is required.";
  }

  if (typeof publicValue.heading !== "string" || !publicValue.heading.trim()) {
    return "A Public Maintenance heading is required.";
  }

  if (typeof publicValue.message !== "string" || !publicValue.message.trim()) {
    return "A Public Maintenance message is required.";
  }

  const contactEmail =
    typeof publicValue.contactEmail === "string"
      ? publicValue.contactEmail.trim()
      : "";

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
    return "A valid public contact email is required.";
  }

  if (!['bookings', 'payments', 'full'].includes(String(publicValue.scope))) {
    return "A valid Public Maintenance scope is required.";
  }

  return null;
}

export function isPublicMaintenanceBlocking(
  config: PlatformMaintenanceConfig,
  action: PublicMaintenanceAction,
) {
  if (!config.public.enabled) return false;
  if (config.public.scope === "full") return true;
  return (
    (config.public.scope === "bookings" && action === "booking") ||
    (config.public.scope === "payments" && action === "payment")
  );
}

export async function loadPlatformMaintenance(
  client: SupabaseClient,
): Promise<{ config: PlatformMaintenanceConfig; revision: number }> {
  const { data, error } = await client
    .from("platform_preferences")
    .select("config,revision")
    .eq("preference_key", "system_maintenance")
    .maybeSingle();

  if (error) throw error;

  return {
    config: normalizePlatformMaintenanceConfig(data?.config),
    revision: typeof data?.revision === "number" ? data.revision : 0,
  };
}

export function maintenanceUnavailableResponse(
  message: string,
  scope: "public" | "staff",
) {
  return Response.json(
    {
      code: scope === "staff" ? "STAFF_MAINTENANCE" : "PUBLIC_MAINTENANCE",
      error: message,
      maintenance: true,
      scope,
    },
    {
      headers: { "Retry-After": "60" },
      status: 503,
    },
  );
}

export async function requirePublicMaintenanceAvailable(
  client: SupabaseClient,
  action: PublicMaintenanceAction,
) {
  try {
    const { config } = await loadPlatformMaintenance(client);

    return isPublicMaintenanceBlocking(config, action)
      ? maintenanceUnavailableResponse(config.public.message, "public")
      : null;
  } catch (error) {
    console.error("[Zingara Maintenance] Public guard failed closed", error);
    return maintenanceUnavailableResponse(
      "Online booking services are temporarily unavailable. Please try again shortly.",
      "public",
    );
  }
}
