import { getServiceClient } from "@/lib/supabase/serverAdmin";
import {
  defaultCookieConsentConfig,
  normalizeCookieConsentConfig,
} from "@/lib/cookieConsentConfig";

export const dynamic = "force-dynamic";

export async function GET() {
  const serviceClient = getServiceClient();

  if (!serviceClient) {
    return Response.json(
      { config: defaultCookieConsentConfig, source: "defaults" },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const { data, error } = await serviceClient
    .from("platform_preferences")
    .select("config,revision")
    .eq("preference_key", "cookie_privacy")
    .maybeSingle();

  if (error) {
    console.error("[Zingara Preferences] Cookie configuration unavailable");
    return Response.json(
      { config: defaultCookieConsentConfig, source: "defaults" },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  return Response.json(
    {
      config: normalizeCookieConsentConfig(data?.config),
      revision: data?.revision ?? 0,
      source: data ? "saved" : "defaults",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
