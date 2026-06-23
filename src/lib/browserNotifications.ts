import { fetchSupabaseApi } from "./supabase/apiClient";

export type ZingaraNotificationTrigger =
  | "booking-cancelled"
  | "booking-confirmed"
  | "booking-updated"
  | "check-in-confirmed"
  | "test";

type NotificationPermissionResult =
  | "default"
  | "denied"
  | "granted"
  | "unsupported";

export type BrowserNotificationDiagnostics = {
  displayModeStandalone: boolean;
  hasNotificationApi: boolean;
  hasPushManager: boolean;
  hasServiceWorker: boolean;
  isIOS: boolean;
  isSecureContext: boolean;
  isStandalonePwa: boolean;
  navigatorStandalone: boolean;
  permission: NotificationPermissionResult;
  userAgent: string;
};

type PushRegistrationResult = {
  ok: boolean;
  permission: NotificationPermissionResult;
  reason?: string;
  subscriptionCount?: number;
};

type PushRegistrationOptions = {
  bookingReference?: string;
  customerEmail?: string;
  customerName?: string;
};

type PushTestResult = {
  failed?: number;
  ok: boolean;
  sent?: number;
  subscriptionCount?: number;
};

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

export type StaffNotificationRecord = {
  createdAt: string;
  id: string;
  message: string;
  readBy: string[];
  title: string;
  trigger: StaffPushTrigger;
  url?: string;
};

const notificationMessages: Record<
  ZingaraNotificationTrigger,
  { body: string; title: string }
> = {
  "booking-cancelled": {
    body: "Your Zingara reservation has been cancelled.",
    title: "The Royal Countess Zingara",
  },
  "booking-confirmed": {
    body: "Your Zingara reservation has been confirmed.",
    title: "The Royal Countess Zingara",
  },
  "booking-updated": {
    body: "Your reservation details have been updated.",
    title: "The Royal Countess Zingara",
  },
  "check-in-confirmed": {
    body: "Welcome to Zingara. Your check-in has been completed.",
    title: "The Royal Countess Zingara",
  },
  test: {
    body: "Your booking payment has been received successfully.",
    title: "The Royal Countess Zingara",
  },
};

function canUseBrowserNotifications() {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    typeof window.Notification !== "undefined"
  );
}

export function getBrowserNotificationDiagnostics(): BrowserNotificationDiagnostics {
  if (typeof window === "undefined") {
    return {
      displayModeStandalone: false,
      hasNotificationApi: false,
      hasPushManager: false,
      hasServiceWorker: false,
      isIOS: false,
      isSecureContext: false,
      isStandalonePwa: false,
      navigatorStandalone: false,
      permission: "unsupported",
      userAgent: "",
    };
  }

  const navigatorWithStandalone = window.navigator as Navigator & {
    standalone?: boolean;
  };
  const displayModeStandalone = window.matchMedia(
    "(display-mode: standalone)",
  ).matches;
  const navigatorStandalone =
    navigatorWithStandalone.standalone === true;
  const isIOS =
    /iPad|iPhone|iPod/.test(window.navigator.userAgent) ||
    (window.navigator.platform === "MacIntel" &&
      window.navigator.maxTouchPoints > 1);
  const hasNotificationApi = canUseBrowserNotifications();

  return {
    displayModeStandalone,
    hasNotificationApi,
    hasPushManager: "PushManager" in window,
    hasServiceWorker: "serviceWorker" in navigator,
    isIOS,
    isSecureContext: window.isSecureContext,
    isStandalonePwa: displayModeStandalone || navigatorStandalone,
    navigatorStandalone,
    permission: hasNotificationApi
      ? window.Notification.permission
      : "unsupported",
    userAgent: window.navigator.userAgent,
  };
}

export function getBrowserNotificationStatusLabel() {
  const diagnostics = getBrowserNotificationDiagnostics();

  if (diagnostics.permission !== "unsupported") {
    return diagnostics.permission;
  }

  if (diagnostics.isIOS && diagnostics.isStandalonePwa) {
    return diagnostics.isSecureContext
      ? "not available in this iOS PWA context"
      : "requires HTTPS for iOS PWA notifications";
  }

  if (diagnostics.isIOS) {
    return diagnostics.isSecureContext
      ? "install to Home Screen required"
      : "requires HTTPS for iOS notifications";
  }

  return "unsupported";
}

export function getBrowserNotificationPermission(): NotificationPermissionResult {
  if (!canUseBrowserNotifications()) {
    return "unsupported";
  }

  return window.Notification.permission;
}

export async function requestBrowserNotificationPermission() {
  const diagnostics = getBrowserNotificationDiagnostics();

  console.info(
    "[Zingara notifications] Support diagnostics:",
    diagnostics,
  );

  if (!canUseBrowserNotifications()) {
    console.info(
      "[Zingara notifications] Notification API unsupported in this browser context.",
    );
    return "unsupported" as const;
  }

  console.info(
    "[Zingara notifications] Current permission:",
    window.Notification.permission,
  );

  if (window.Notification.permission !== "default") {
    console.info(
      "[Zingara notifications] Permission request skipped because permission is already:",
      window.Notification.permission,
    );
    return window.Notification.permission;
  }

  console.info(
    "[Zingara notifications] Requesting permission from direct user action.",
  );

  try {
    const permission = await window.Notification.requestPermission();

    console.info(
      "[Zingara notifications] Permission request result:",
      permission,
    );

    return permission;
  } catch (error) {
    console.error(
      "[Zingara notifications] Permission request failed:",
      error,
    );
    return window.Notification.permission;
  }
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = `${base64String}${padding}`
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index);
  }

  return outputArray;
}

async function getPushPublicKey() {
  const response = await fetch("/api/push-subscriptions");

  if (!response.ok) {
    return "";
  }

  const payload = (await response.json()) as {
    configured?: boolean;
    publicKey?: string;
  };

  return payload.configured ? payload.publicKey ?? "" : "";
}

export async function registerZingaraPushSubscription(
  options: PushRegistrationOptions = {},
): Promise<PushRegistrationResult> {
  const diagnostics = getBrowserNotificationDiagnostics();

  console.info(
    "[Zingara push] Subscription diagnostics:",
    diagnostics,
  );

  if (!diagnostics.hasNotificationApi) {
    return {
      ok: false,
      permission: "unsupported",
      reason: "Notification API unsupported.",
    };
  }

  if (!diagnostics.hasServiceWorker || !diagnostics.hasPushManager) {
    return {
      ok: false,
      permission: getBrowserNotificationPermission(),
      reason: "Service worker push is unsupported in this browser context.",
    };
  }

  const permission = await requestBrowserNotificationPermission();

  if (permission !== "granted") {
    return {
      ok: false,
      permission,
      reason: "Notification permission was not granted.",
    };
  }

  const publicKey = await getPushPublicKey();

  if (!publicKey) {
    return {
      ok: false,
      permission,
      reason: "Push notifications are not configured.",
    };
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const existingSubscription =
      await registration.pushManager.getSubscription();
    const subscription =
      existingSubscription ??
      (await registration.pushManager.subscribe({
        applicationServerKey: urlBase64ToUint8Array(publicKey),
        userVisibleOnly: true,
      }));
    const payload = await fetchSupabaseApi<{
      subscriptionCount?: number;
    }>("/api/push-subscriptions", {
      body: {
        context: {
          bookingReference: options.bookingReference,
          customerEmail: options.customerEmail,
          customerName: options.customerName,
        },
        diagnostics,
        subscription: subscription.toJSON(),
      },
      method: "POST",
    });

    return {
      ok: true,
      permission,
      subscriptionCount: payload.subscriptionCount,
    };
  } catch (error) {
    console.error("[Zingara push] Subscription registration failed:", error);

    return {
      ok: false,
      permission,
      reason: "Push subscription registration failed.",
    };
  }
}

export async function sendZingaraGuestPushNotification(
  trigger: GuestPushTrigger,
  options: { bookingReference: string },
) {
  try {
    return await fetchSupabaseApi<PushTestResult>("/api/guest-push", {
      body: {
        bookingReference: options.bookingReference,
        trigger,
      },
      method: "POST",
    });
  } catch (error) {
    console.error("[Zingara push] Guest push request failed:", error);
    return {
      ok: false,
    };
  }
}

export async function sendZingaraPushTestNotification(): Promise<PushTestResult> {
  try {
    return await fetchSupabaseApi<PushTestResult>("/api/admin/push-test", {
      method: "POST",
    });
  } catch {
    return {
      ok: false,
    };
  }
}

export async function sendZingaraStaffPushNotification(
  trigger: StaffPushTrigger,
  options: Partial<{
    body: string;
    bookingReference: string;
    corporateRequestId: string;
    waitlistId: string;
  }> = {},
) {
  try {
    return await fetchSupabaseApi<PushTestResult>("/api/admin/staff-push", {
      body: {
        bookingReference: options.bookingReference,
        body: options.body,
        corporateRequestId: options.corporateRequestId,
        trigger,
        waitlistId: options.waitlistId,
      },
      method: "POST",
    });
  } catch (error) {
    console.error("[Zingara push] Staff push request failed:", error);
    return {
      ok: false,
    };
  }
}

export async function getStaffNotifications() {
  return fetchSupabaseApi<{
    notifications: StaffNotificationRecord[];
    userId?: string;
  }>("/api/admin/notifications");
}

export async function markStaffNotificationRead(id: string) {
  return fetchSupabaseApi<{
    notifications: StaffNotificationRecord[];
    userId?: string;
  }>("/api/admin/notifications", {
    body: {
      action: "mark-read",
      id,
    },
    method: "PATCH",
  });
}

export async function markAllStaffNotificationsRead() {
  return fetchSupabaseApi<{
    notifications: StaffNotificationRecord[];
    userId?: string;
  }>("/api/admin/notifications", {
    body: {
      action: "mark-all-read",
    },
    method: "PATCH",
  });
}

async function showSandboxNotification(title: string, body: string) {
  const options: NotificationOptions = {
    badge: "/apple-icon",
    body,
    icon: "/icon",
    tag: "zingara-guest-notification",
  };

  if ("serviceWorker" in navigator) {
    try {
      const registration = await navigator.serviceWorker.ready;

      if ("showNotification" in registration) {
        await registration.showNotification(title, options);
        return true;
      }
    } catch {
      // Fall back to page-level notifications below.
    }
  }

  new window.Notification(title, options);
  return true;
}

export async function sendZingaraBrowserNotification(
  trigger: ZingaraNotificationTrigger,
  overrides: Partial<{ body: string; title: string }> = {},
) {
  if (!canUseBrowserNotifications()) {
    console.info(
      "[Zingara notifications] Send skipped: Notification API unsupported.",
    );
    return {
      ok: false,
      permission: "unsupported" as NotificationPermissionResult,
    };
  }

  const permission = await requestBrowserNotificationPermission();

  if (permission !== "granted") {
    console.info(
      "[Zingara notifications] Send skipped: permission is",
      permission,
    );
    return {
      ok: false,
      permission,
    };
  }

  const message = notificationMessages[trigger];

  await showSandboxNotification(
    overrides.title ?? message.title,
    overrides.body ?? message.body,
  );

  console.info(
    "[Zingara notifications] Notification displayed:",
    trigger,
  );

  return {
    ok: true,
    permission,
  };
}
