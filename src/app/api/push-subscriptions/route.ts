import {
  defaultVenueSettings,
} from "@/lib/zingaraDemo";
import {
  getAdminRoleFromName,
  getRequestingUser,
  getServiceClient,
  isKnownAdminRoleName,
} from "@/lib/supabase/serverAdmin";
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit";
import { type AdminRole } from "@/lib/zingaraAccess";

export const dynamic = "force-dynamic";

const defaultVenueKey = defaultVenueSettings.venueId || "zingara-cape-town";

type PushSubscriptionRecord = {
  audience?: "guest" | "staff";
  bookingReference?: string;
  bookingReferences?: string[];
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

function normalizeBookingReference(reference?: string | null) {
  return reference?.trim().toUpperCase() ?? "";
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
  const bookingReference = normalizeBookingReference(
    guestContext?.bookingReference,
  );

  return {
    audience: bookingReference ? "guest" : staffContext ? "staff" : "guest",
    bookingReference,
    bookingReferences: bookingReference ? [bookingReference] : [],
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

function mergeBookingReferences(
  existingSubscription: PushSubscriptionRecord | undefined,
  nextSubscription: PushSubscriptionRecord,
) {
  return Array.from(
    new Set(
      [
        ...(existingSubscription?.bookingReferences ?? []),
        existingSubscription?.bookingReference,
        ...(nextSubscription.bookingReferences ?? []),
        nextSubscription.bookingReference,
      ]
        .map((reference) => normalizeBookingReference(reference))
        .filter((reference): reference is string => Boolean(reference)),
    ),
  );
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

  if (!isKnownAdminRoleName(role?.name)) {
    return undefined;
  }

  return {
    email: data.email,
    name: data.full_name,
    role: getAdminRoleFromName(role?.name),
    staffProfileId: data.id,
    userId: data.user_id,
  };
}

async function getVerifiedGuestContext(
  serviceClient: NonNullable<ReturnType<typeof getServiceClient>>,
  bookingReference: string,
  claimedEmail: string | undefined,
) {
  const normalizedEmail = claimedEmail?.trim().toLowerCase() ?? "";

  if (!bookingReference || !normalizedEmail) {
    return undefined;
  }

  const { data: booking, error: bookingError } = await serviceClient
    .from("bookings")
    .select("customer_id")
    .eq("booking_reference", bookingReference)
    .maybeSingle();

  if (bookingError || !booking?.customer_id) {
    return undefined;
  }

  const { data: customer, error: customerError } = await serviceClient
    .from("customers")
    .select("email,first_name,surname")
    .eq("id", booking.customer_id)
    .maybeSingle();

  if (
    customerError ||
    !customer?.email ||
    customer.email.trim().toLowerCase() !== normalizedEmail
  ) {
    return undefined;
  }

  return {
    bookingReference,
    customerEmail: customer.email,
    customerName: [customer.first_name, customer.surname]
      .filter(Boolean)
      .join(" ")
      .trim(),
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
    const guestBookingReference = normalizeBookingReference(
      body.context?.bookingReference,
    );

    const serviceClient = getServiceClient();

    if (!serviceClient) {
      return Response.json(
        { error: "Push notifications are temporarily unavailable." },
        { status: 503 },
      );
    }

    const ipLimit = await checkRateLimit(
      request,
      { limit: 12, scope: "push_subscription_ip", windowSeconds: 300 },
      [],
      serviceClient,
    );

    if (!ipLimit.allowed) {
      return rateLimitResponse(ipLimit.retryAfterSeconds);
    }

    const guestContext = staffContext
      ? undefined
      : await getVerifiedGuestContext(
          serviceClient,
          guestBookingReference,
          body.context?.customerEmail,
        );

    if (!staffContext && !guestContext) {
      return Response.json(
        { error: "The booking details could not be verified." },
        { status: 401 },
      );
    }

    if (guestContext) {
      const bookingLimit = await checkRateLimit(
        request,
        { limit: 4, scope: "push_subscription_booking", windowSeconds: 600 },
        [guestContext.bookingReference, guestContext.customerEmail],
        serviceClient,
      );

      if (!bookingLimit.allowed) {
        return rateLimitResponse(bookingLimit.retryAfterSeconds);
      }
    }

    const subscription = normalizeSubscription(
      body.subscription,
      request,
      staffContext,
      guestContext,
    );

    if (!subscription) {
      return Response.json(
        { error: "A valid push subscription is required." },
        { status: 400 },
      );
    }

    const { row } = await getVenueSettingsRow();
    const existingSubscriptions = getPushSubscriptions(row);
    const existingSubscription = existingSubscriptions.find(
      (currentSubscription) =>
        currentSubscription.endpoint === subscription.endpoint,
    );
    const bookingReferences = mergeBookingReferences(
      existingSubscription,
      subscription,
    );
    const nextSubscriptions = [
      ...existingSubscriptions.filter(
        (currentSubscription) =>
          currentSubscription.endpoint !== subscription.endpoint,
      ),
      {
        ...subscription,
        audience:
          bookingReferences.length > 0
            ? "guest"
            : (subscription.audience ?? existingSubscription?.audience),
        bookingReferences,
        createdAt: existingSubscription?.createdAt ?? subscription.createdAt,
        customerEmail:
          subscription.customerEmail ?? existingSubscription?.customerEmail,
        customerName:
          subscription.customerName ?? existingSubscription?.customerName,
        role: subscription.role ?? existingSubscription?.role,
        staffEmail:
          subscription.staffEmail ?? existingSubscription?.staffEmail,
        staffName: subscription.staffName ?? existingSubscription?.staffName,
        staffProfileId:
          subscription.staffProfileId ?? existingSubscription?.staffProfileId,
        userId: subscription.userId ?? existingSubscription?.userId,
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
