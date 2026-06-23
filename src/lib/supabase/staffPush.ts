import { createRequire } from "node:module";
import { type AdminRole } from "@/lib/zingaraAccess";
import { defaultVenueSettings } from "@/lib/zingaraDemo";
import { getServiceClient } from "@/lib/supabase/serverAdmin";

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

export type StaffPushTrigger =
  | "booking-cancelled"
  | "guest-checked-in"
  | "new-booking"
  | "new-corporate-request"
  | "operational-broadcast-sent"
  | "payment-received"
  | "waitlist-promotion";

export type GuestPushTrigger =
  | "payment-received"
  | "reservation-cancelled"
  | "reservation-confirmed"
  | "reservation-pending-payment"
  | "waitlist-promoted";

type PushSubscriptionRecord = {
  audience?: "guest" | "staff";
  bookingReference?: string;
  customerEmail?: string;
  endpoint: string;
  expirationTime?: number | null;
  keys?: {
    auth?: string;
    p256dh?: string;
  };
  role?: AdminRole;
};

type VenueSettingsRow = {
  branding?: Record<string, unknown> | null;
  name?: string | null;
  operational_config: Record<string, unknown> | null;
  settings?: typeof defaultVenueSettings | null;
  venue_key?: string;
};

type StaffPushInput = {
  bookingReference?: string;
  body?: string;
  corporateRequestId?: string;
  title?: string;
  trigger: StaffPushTrigger;
  waitlistId?: string;
};

export type StaffNotificationRecord = {
  createdAt: string;
  id: string;
  message: string;
  readBy: string[];
  title: string;
  trigger: StaffPushTrigger;
  url?: string;
};

type GuestPushInput = {
  bookingReference?: string;
  trigger: GuestPushTrigger;
};

const rolesByTrigger: Record<StaffPushTrigger, AdminRole[]> = {
  "booking-cancelled": [
    "super-admin",
    "venue-manager",
    "box-office-staff",
  ],
  "guest-checked-in": ["super-admin", "venue-manager"],
  "new-booking": ["super-admin", "venue-manager", "box-office-staff"],
  "new-corporate-request": [
    "super-admin",
    "venue-manager",
    "box-office-staff",
  ],
  "operational-broadcast-sent": ["super-admin", "venue-manager"],
  "payment-received": ["super-admin", "venue-manager", "box-office-staff"],
  "waitlist-promotion": [
    "super-admin",
    "venue-manager",
    "box-office-staff",
  ],
};

function getPushConfig() {
  return {
    privateKey: process.env.VAPID_PRIVATE_KEY ?? "",
    publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "",
    subject: process.env.VAPID_SUBJECT ?? "mailto:notifications@zingara.co.za",
  };
}

function getDefaultMessage(input: StaffPushInput) {
  if (input.body) {
    return input.body;
  }

  if (input.trigger === "new-booking") {
    return `New booking received: ${input.bookingReference ?? "New booking"}`;
  }

  if (input.trigger === "new-corporate-request") {
    return "New corporate enquiry received";
  }

  if (input.trigger === "waitlist-promotion") {
    return "Waitlist guest promoted to booking";
  }

  if (input.trigger === "booking-cancelled") {
    return `Booking cancelled: ${input.bookingReference ?? "Booking"}`;
  }

  if (input.trigger === "guest-checked-in") {
    return `Guest checked in: ${input.bookingReference ?? "Booking"}`;
  }

  if (input.trigger === "payment-received") {
    return `Payment received: ${input.bookingReference ?? "Booking"}`;
  }

  return "Operational broadcast sent";
}

function getDefaultTitle(input: StaffPushInput) {
  if (input.title) {
    return input.title;
  }

  if (input.trigger === "new-booking") {
    return "New Booking";
  }

  if (input.trigger === "new-corporate-request") {
    return "Corporate Request";
  }

  if (input.trigger === "waitlist-promotion") {
    return "Waitlist Promotion";
  }

  if (input.trigger === "booking-cancelled") {
    return "Booking Cancelled";
  }

  if (input.trigger === "guest-checked-in") {
    return "Guest Checked In";
  }

  if (input.trigger === "payment-received") {
    return "Payment Received";
  }

  return "Operational Broadcast";
}

function getStaffNotificationUrl(input: StaffPushInput) {
  if (
    input.trigger === "new-booking" ||
    input.trigger === "booking-cancelled" ||
    input.trigger === "guest-checked-in" ||
    input.trigger === "payment-received"
  ) {
    return input.bookingReference
      ? `/admin?booking=${encodeURIComponent(input.bookingReference)}`
      : "/admin?section=bookings";
  }

  if (input.trigger === "waitlist-promotion") {
    return input.waitlistId
      ? `/admin?waitlist=${encodeURIComponent(input.waitlistId)}`
      : "/admin?section=waitlist";
  }

  if (input.trigger === "new-corporate-request") {
    return input.corporateRequestId
      ? `/admin?corporate=${encodeURIComponent(input.corporateRequestId)}`
      : "/admin?section=corporate";
  }

  return "/admin";
}

function getGuestMessage(input: GuestPushInput) {
  if (input.trigger === "reservation-confirmed") {
    return `Your booking ${input.bookingReference ?? ""} has been confirmed.`;
  }

  if (input.trigger === "payment-received") {
    return `Payment received for ${input.bookingReference ?? "your booking"}.`;
  }

  if (input.trigger === "reservation-pending-payment") {
    return "Your booking is awaiting payment.";
  }

  if (input.trigger === "waitlist-promoted") {
    return "A seat is now available for your booking.";
  }

  return "Your booking has been cancelled.";
}

function getPushSubscriptions(row: VenueSettingsRow | null) {
  const subscriptions = row?.operational_config?.pushSubscriptions;

  return Array.isArray(subscriptions)
    ? (subscriptions as PushSubscriptionRecord[])
    : [];
}

function getStaffNotifications(row: VenueSettingsRow | null) {
  const notifications = row?.operational_config?.staffNotifications;

  return Array.isArray(notifications)
    ? (notifications as StaffNotificationRecord[])
    : [];
}

async function loadVenueSettingsRow() {
  const serviceClient = getServiceClient();

  if (!serviceClient) {
    return {
      row: null,
      serviceClient,
    };
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

async function appendStaffNotification(input: StaffPushInput) {
  const { row, serviceClient } = await loadVenueSettingsRow();

  if (!serviceClient) {
    return null;
  }

  const now = new Date().toISOString();
  const notification: StaffNotificationRecord = {
    createdAt: now,
    id: `${input.trigger}-${input.bookingReference ?? "event"}-${Date.now()}`,
    message: getDefaultMessage(input),
    readBy: [],
    title: getDefaultTitle(input),
    trigger: input.trigger,
    url: getStaffNotificationUrl(input),
  };
  const staffNotifications = [
    notification,
    ...getStaffNotifications(row),
  ].slice(0, 100);
  const operationalConfig = {
    ...(row?.operational_config ?? {}),
    staffNotifications,
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

  return notification;
}

export async function sendStaffPushNotification(input: StaffPushInput) {
  console.info("[Zingara push diagnostics] Staff push trigger fired", {
    bookingReference: input.bookingReference ?? null,
    trigger: input.trigger,
  });
  const pushConfig = getPushConfig();

  if (!pushConfig.publicKey || !pushConfig.privateKey) {
    console.info("[Zingara push diagnostics] Staff push blocked: VAPID missing", {
      hasPrivateKey: Boolean(pushConfig.privateKey),
      hasPublicKey: Boolean(pushConfig.publicKey),
      trigger: input.trigger,
    });
    return {
      failed: 0,
      ok: false,
      sent: 0,
      subscriptionCount: 0,
    };
  }

  let venueRow: VenueSettingsRow | null = null;
  let serviceClient: ReturnType<typeof getServiceClient> = null;

  try {
    const loaded = await loadVenueSettingsRow();

    serviceClient = loaded.serviceClient;
    venueRow = loaded.row;
  } catch (error) {
    console.error("[Zingara push] Failed to load venue notification row", error);
  }

  if (!serviceClient) {
    console.info(
      "[Zingara push diagnostics] Staff push blocked: service client missing",
      { trigger: input.trigger },
    );
    return {
      failed: 0,
      ok: false,
      sent: 0,
      subscriptionCount: 0,
    };
  }

  try {
    await appendStaffNotification(input);
  } catch (error) {
    console.error("[Zingara push] Failed to save staff notification", error);
  }

  const targetRoles = new Set(rolesByTrigger[input.trigger]);
  const allSubscriptions = getPushSubscriptions(venueRow);
  console.info("[Zingara push diagnostics] Staff subscriptions loaded", {
    rolesFound: allSubscriptions.map((subscription) => subscription.role ?? null),
    subscriptionCount: allSubscriptions.length,
    targetRoles: Array.from(targetRoles),
    trigger: input.trigger,
  });
  const subscriptions = allSubscriptions.filter(
    (subscription) =>
      subscription.role && targetRoles.has(subscription.role),
  );

  console.info("[Zingara push diagnostics] Staff role filter complete", {
    matchedCount: subscriptions.length,
    matchedRoles: subscriptions.map((subscription) => subscription.role ?? null),
    trigger: input.trigger,
  });

  if (subscriptions.length === 0) {
    console.info(
      "[Zingara push diagnostics] Staff push blocked: no role-matched subscriptions",
      { trigger: input.trigger },
    );
    return {
      failed: 0,
      ok: false,
      sent: 0,
      subscriptionCount: 0,
    };
  }

  webPush.setVapidDetails(
    pushConfig.subject,
    pushConfig.publicKey,
    pushConfig.privateKey,
  );

  const payload = JSON.stringify({
    body: getDefaultMessage(input),
    tag: `zingara-staff-${input.trigger}`,
    title: input.title ?? "Zingara",
    url: getStaffNotificationUrl(input),
  });
  console.info("[Zingara push diagnostics] Staff push send attempted", {
    matchedSubscriptions: subscriptions.length,
    message: getDefaultMessage(input),
    trigger: input.trigger,
  });
  const results = await Promise.allSettled(
    subscriptions.map((subscription) =>
      webPush.sendNotification(subscription, payload),
    ),
  );
  const sent = results.filter((result) => result.status === "fulfilled").length;
  const failed = results.length - sent;

  console.info("[Zingara push diagnostics] Staff push send result", {
    failed,
    sent,
    subscriptionCount: subscriptions.length,
    trigger: input.trigger,
  });

  results.forEach((result) => {
    if (result.status === "rejected") {
      console.error("[Zingara push] Staff push delivery failed", result.reason);
    }
  });

  return {
    failed,
    ok: sent > 0,
    sent,
    subscriptionCount: subscriptions.length,
  };
}

export async function sendGuestPushNotification(input: GuestPushInput) {
  console.info("[Zingara push diagnostics] Guest push trigger fired", {
    bookingReference: input.bookingReference ?? null,
    trigger: input.trigger,
  });
  const pushConfig = getPushConfig();

  if (!pushConfig.publicKey || !pushConfig.privateKey) {
    console.info("[Zingara push diagnostics] Guest push blocked: VAPID missing", {
      hasPrivateKey: Boolean(pushConfig.privateKey),
      hasPublicKey: Boolean(pushConfig.publicKey),
      trigger: input.trigger,
    });
    return {
      failed: 0,
      ok: false,
      sent: 0,
      subscriptionCount: 0,
    };
  }

  const serviceClient = getServiceClient();

  if (!serviceClient) {
    console.info(
      "[Zingara push diagnostics] Guest push blocked: service client missing",
      { trigger: input.trigger },
    );
    return {
      failed: 0,
      ok: false,
      sent: 0,
      subscriptionCount: 0,
    };
  }

  const { data, error } = await serviceClient
    .from("venue_settings")
    .select("operational_config")
    .eq("venue_key", defaultVenueKey)
    .maybeSingle();

  if (error) {
    console.error("[Zingara push] Failed to load guest subscriptions", error);
    return {
      failed: 0,
      ok: false,
      sent: 0,
      subscriptionCount: 0,
    };
  }

  const allSubscriptions = getPushSubscriptions(data as VenueSettingsRow | null);
  const subscriptions = allSubscriptions.filter(
    (subscription) =>
      subscription.audience === "guest" &&
      subscription.bookingReference === input.bookingReference,
  );

  console.info("[Zingara push diagnostics] Guest subscription filter complete", {
    bookingReference: input.bookingReference ?? null,
    guestSubscriptionCount: allSubscriptions.filter(
      (subscription) => subscription.audience === "guest",
    ).length,
    matchedCount: subscriptions.length,
    trigger: input.trigger,
  });

  if (subscriptions.length === 0) {
    return {
      failed: 0,
      ok: false,
      sent: 0,
      subscriptionCount: 0,
    };
  }

  webPush.setVapidDetails(
    pushConfig.subject,
    pushConfig.publicKey,
    pushConfig.privateKey,
  );

  const payload = JSON.stringify({
    body: getGuestMessage(input),
    tag: `zingara-guest-${input.trigger}-${input.bookingReference ?? "booking"}`,
    title: "The Royal Countess Zingara",
    url: input.bookingReference
      ? `/ticket/${encodeURIComponent(input.bookingReference)}`
      : "/book",
  });
  const results = await Promise.allSettled(
    subscriptions.map((subscription) =>
      webPush.sendNotification(subscription, payload),
    ),
  );
  const sent = results.filter((result) => result.status === "fulfilled").length;
  const failed = results.length - sent;

  console.info("[Zingara push diagnostics] Guest push send result", {
    failed,
    sent,
    subscriptionCount: subscriptions.length,
    trigger: input.trigger,
  });

  results.forEach((result) => {
    if (result.status === "rejected") {
      console.error("[Zingara push] Guest push delivery failed", result.reason);
    }
  });

  return {
    failed,
    ok: sent > 0,
    sent,
    subscriptionCount: subscriptions.length,
  };
}
