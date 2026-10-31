import {
  defaultVenueSettings,
  normalizeVenueSettings,
} from "@/lib/zingaraDemo";
import { getServiceClient } from "@/lib/supabase/serverAdmin";
import { loadSecretGuestListFeatureEnabled } from "@/lib/secretGuestListFeature";

export const dynamic = "force-dynamic";

export async function GET() {
  const serviceClient = getServiceClient();

  if (!serviceClient) {
    return Response.json(
      { error: "Venue settings are temporarily unavailable." },
      { status: 503 },
    );
  }

  const [{ data, error }, secretGuestList] = await Promise.all([
    serviceClient
      .from("venue_settings")
      .select("venue_key,name,settings")
      .eq("venue_key", defaultVenueSettings.venueId)
      .maybeSingle(),
    loadSecretGuestListFeatureEnabled(serviceClient).catch((featureError) => {
      console.error(
        "[Zingara API] Failed to load Secret Guest List feature status",
        featureError,
      );
      return false;
    }),
  ]);

  if (error) {
    console.error("[Zingara API] Failed to load public venue settings", error);
    return Response.json(
      { error: "Venue settings could not be loaded." },
      { status: 500 },
    );
  }

  const settings = normalizeVenueSettings({
      ...((data?.settings as Record<string, unknown> | null) ?? {}),
      venueId: data?.venue_key || defaultVenueSettings.venueId,
      venueName: data?.name || defaultVenueSettings.venueName,
    });
  const {
    corporateEnquiryRecipients: _corporateRecipients,
    friendsAndFamily: _staffPricing,
    ...publicOperationalSettings
  } = settings.operationalSettings;

  return Response.json({
    features: { secretGuestList },
    settings: {
      ...settings,
      operationalSettings: publicOperationalSettings,
    },
  });
}
