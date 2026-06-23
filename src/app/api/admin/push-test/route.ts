import { createRequire } from "node:module";
import {
  defaultVenueSettings,
} from "@/lib/zingaraDemo";
import {
  getServiceClient,
  requireActiveStaff,
} from "@/lib/supabase/serverAdmin";

export const dynamic = "force-dynamic";

const require = createRequire(import.meta.url);
const webPush = require("web-push") as {
  sendNotification: (
    subscription: PushSubscriptionRecord,
    payload: string,
  ) => Promise<unknown>;
  setVapidDetails: (
    subject: string,
    publicKey: string,
    privateKey: string,
  ) => void;
};

const defaultVenueKey = defaultVenueSettings.venueId || "zingara-cape-town";

type PushSubscriptionRecord = {
  endpoint: string;
  expirationTime?: number | null;
  keys?: {
    auth?: string;
    p256dh?: string;
  };
};

type VenueSettingsRow = {
  operational_config: Record<string, unknown> | null;
};

function getPushConfig() {
  return {
    privateKey: process.env.VAPID_PRIVATE_KEY ?? "",
    publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "",
    subject: process.env.VAPID_SUBJECT ?? "mailto:notifications@zingara.co.za",
  };
}

function getPushSubscriptions(row: VenueSettingsRow | null) {
  const subscriptions = row?.operational_config?.pushSubscriptions;

  return Array.isArray(subscriptions)
    ? (subscriptions as PushSubscriptionRecord[])
    : [];
}

export async function POST(request: Request) {
  const auth = await requireActiveStaff(request);

  if (auth.error || !auth.serviceClient) {
    return auth.error;
  }

  const pushConfig = getPushConfig();

  if (!pushConfig.publicKey || !pushConfig.privateKey) {
    return Response.json(
      { error: "Push notifications are not configured." },
      { status: 500 },
    );
  }

  try {
    const serviceClient = getServiceClient();

    if (!serviceClient) {
      return Response.json(
        { error: "Supabase service role is not configured." },
        { status: 500 },
      );
    }

    const { data, error } = await serviceClient
      .from("venue_settings")
      .select("operational_config")
      .eq("venue_key", defaultVenueKey)
      .maybeSingle();

    if (error) {
      throw error;
    }

    const subscriptions = getPushSubscriptions(data as VenueSettingsRow | null);

    if (subscriptions.length === 0) {
      return Response.json(
        { error: "No push subscriptions are registered yet." },
        { status: 404 },
      );
    }

    webPush.setVapidDetails(
      pushConfig.subject,
      pushConfig.publicKey,
      pushConfig.privateKey,
    );

    const payload = JSON.stringify({
      body: "Your booking payment has been received successfully.",
      tag: "zingara-admin-test-notification",
      title: "The Royal Countess Zingara",
      url: "/admin",
    });
    const results = await Promise.allSettled(
      subscriptions.map((subscription) =>
        webPush.sendNotification(subscription, payload),
      ),
    );
    const sent = results.filter((result) => result.status === "fulfilled").length;
    const failed = results.length - sent;

    results.forEach((result) => {
      if (result.status === "rejected") {
        console.error("[Zingara API] Push test delivery failed", result.reason);
      }
    });

    return Response.json({
      failed,
      ok: sent > 0,
      sent,
      subscriptionCount: subscriptions.length,
    });
  } catch (error) {
    console.error("[Zingara API] Failed to send test push notification", error);

    return Response.json(
      { error: "Test push notification could not be sent." },
      { status: 500 },
    );
  }
}
