import {
  defaultVenueSettings,
} from "@/lib/zingaraDemo";
import {
  getAdminRoleFromName,
  getRequestingUser,
  getServiceClient,
} from "@/lib/supabase/serverAdmin";
import { type AdminRole } from "@/lib/zingaraAccess";

export const dynamic = "force-dynamic";

const defaultVenueKey = defaultVenueSettings.venueId || "zingara-cape-town";

type PushSubscriptionRecord = {
  audience?: "guest" | "staff";
  bookingReference?: string;
  createdAt: string;
  customerEmail?: string;
  customerName?: string;
  endpoint: string;
  expirationTime?: number | null;
  keys?: {
    auth?: string;
    p256dh?: string;
  };
  permission?: string;
  role?: AdminRole;
  staffEmail?: string;
  staffName?: string;
  staffProfileId?: string;
  updatedAt: string;
  userAgent?: string;
  userId?: string;
};

type VenueSettingsRow = {
  branding: Record<string, unknown> | null;
  name: string | null;
  operational_config: Record<string, unknown> | null;
  settings: typeof defaultVenueSettings | null;
  venue_key: string;
};

function getPublicVapidKey() {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
}

async function getVenueSettingsRow() {
  const serviceClient = getServiceClient();

  if (!serviceClient) {
    throw new Error("Supabase service role is not configured.");
  }

  const { data, error } = await serviceClient
    .from("venue_settings")
    .select("venue_key,name,settings,branding,operational_config")
    .eq("venue_key", defaultVenueKey)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return {
    row: data as VenueSettingsRow | null,
    serviceClient,
  };
}

function getPushSubscriptions(row: VenueSettingsRow | null) {
  const subscriptions = row?.operational_config?.pushSubscriptions;

  return Array.isArray(subscriptions)
    ? (subscriptions as PushSubscriptionRecord[])
    : [];
}

function normalizeSubscription(
  input: unknown,
  request: Request,
  staffContext?: {
    email?: string;
    name?: string;
    role?: AdminRole;
    staffProfileId?: string;
    userId?: string;
  },
  guestContext?: {
    bookingReference?: string;
    customerEmail?: string;
    customerName?: string;
  },
): PushSubscriptionRecord | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const subscription = input as {
    endpoint?: unknown;
    expirationTime?: unknown;
    keys?: {
      auth?: unknown;
      p256dh?: unknown;
    };
  };

  if (typeof subscription.endpoint !== "string" || !subscription.endpoint) {
    return null;
  }

  const now = new Date().toISOString();

  return {
    audience: staffContext ? "staff" : "guest",
    bookingReference: guestContext?.bookingReference,
    createdAt: now,
    customerEmail: guestContext?.customerEmail,
    customerName: guestContext?.customerName,
    endpoint: subscription.endpoint,
    expirationTime:
      typeof subscription.expirationTime === "number"
        ? subscription.expirationTime
        : null,
    keys: {
      auth:
        typeof subscription.keys?.auth === "string"
          ? subscription.keys.auth
          : undefined,
      p256dh:
        typeof subscription.keys?.p256dh === "string"
          ? subscription.keys.p256dh
          : undefined,
    },
    permission: "granted",
    role: staffContext?.role,
    staffEmail: staffContext?.email,
    staffName: staffContext?.name,
    staffProfileId: staffContext?.staffProfileId,
    updatedAt: now,
    userAgent: request.headers.get("user-agent") ?? undefined,
    userId: staffContext?.userId,
  };
}

async function getStaffContext(request: Request) {
  const user = await getRequestingUser(request);

  if (!user) {
    return undefined;
  }

  const serviceClient = getServiceClient();

  if (!serviceClient) {
    return undefined;
  }

  const { data, error } = await serviceClient
    .from("staff_profiles")
    .select("id,user_id,full_name,email,active,roles(name)")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !data?.active) {
    if (error) {
      console.error("[Zingara API] Failed to load push staff context", error);
    }
    return undefined;
  }

  const role = Array.isArray(data.roles) ? data.roles[0] : data.roles;

  return {
    email: data.email,
    name: data.full_name,
    role: getAdminRoleFromName(role?.name),
    staffProfileId: data.id,
    userId: data.user_id,
  };
}

export async function GET() {
  return Response.json({
    configured: Boolean(getPublicVapidKey()),
    publicKey: getPublicVapidKey(),
  });
}

export async function POST(request: Request) {
  try {
    if (!getPublicVapidKey()) {
      return Response.json(
        { error: "Push notifications are not configured." },
        { status: 500 },
      );
    }

    const body = (await request.json()) as {
      context?: {
        bookingReference?: string;
        customerEmail?: string;
        customerName?: string;
      };
      subscription?: unknown;
    };
    const staffContext = await getStaffContext(request);
    console.info("[Zingara push diagnostics] Subscription registration requested", {
      hasStaffContext: Boolean(staffContext),
      role: staffContext?.role ?? null,
      staffEmail: staffContext?.email ?? null,
      staffProfileId: staffContext?.staffProfileId ?? null,
      userId: staffContext?.userId ?? null,
    });
    const subscription = normalizeSubscription(
      body.subscription,
      request,
      staffContext,
      body.context,
    );

    if (!subscription) {
      return Response.json(
        { error: "A valid push subscription is required." },
        { status: 400 },
      );
    }

    const { row, serviceClient } = await getVenueSettingsRow();
    const existingSubscriptions = getPushSubscriptions(row);
    console.info("[Zingara push diagnostics] Existing subscriptions loaded", {
      existingCount: existingSubscriptions.length,
      existingRoles: existingSubscriptions.map(
        (currentSubscription) => currentSubscription.role ?? null,
      ),
    });
    const existingSubscription = existingSubscriptions.find(
      (currentSubscription) =>
        currentSubscription.endpoint === subscription.endpoint,
    );
    const nextSubscriptions = [
      ...existingSubscriptions.filter(
        (currentSubscription) =>
          currentSubscription.endpoint !== subscription.endpoint,
      ),
      {
        ...subscription,
        createdAt: existingSubscription?.createdAt ?? subscription.createdAt,
      },
    ];
    const operationalConfig = {
      ...(row?.operational_config ?? {}),
      pushSubscriptions: nextSubscriptions,
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

    console.info("[Zingara push diagnostics] Subscription persisted", {
      endpointTail: subscription.endpoint.slice(-16),
      role: subscription.role ?? null,
      staffEmail: subscription.staffEmail ?? null,
      subscriptionCount: nextSubscriptions.length,
    });

    return Response.json({
      ok: true,
      subscriptionCount: nextSubscriptions.length,
    });
  } catch (error) {
    console.error("[Zingara API] Failed to save push subscription", error);

    return Response.json(
      { error: "Push subscription could not be saved." },
      { status: 500 },
    );
  }
}
