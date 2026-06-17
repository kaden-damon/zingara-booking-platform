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
