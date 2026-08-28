import type { PushDeviceStatus } from "./browserNotifications";

export type DeviceSetupPlatform = "android" | "desktop" | "ios";

type DeviceDetectionInput = {
  maxTouchPoints?: number;
  platform?: string;
  userAgent: string;
};

type InstallGuidanceInput = {
  canPromptInstall: boolean;
  isInstalled: boolean;
  platform: DeviceSetupPlatform;
};

export function detectDeviceSetupPlatform({
  maxTouchPoints = 0,
  platform = "",
  userAgent,
}: DeviceDetectionInput): DeviceSetupPlatform {
  if (
    /iPad|iPhone|iPod/i.test(userAgent) ||
    (platform === "MacIntel" && maxTouchPoints > 1)
  ) {
    return "ios";
  }

  return /Android/i.test(userAgent) ? "android" : "desktop";
}

export function getDeviceInstallGuidance({
  canPromptInstall,
  isInstalled,
  platform,
}: InstallGuidanceInput) {
  if (isInstalled) {
    return {
      actionLabel: null,
      heading: "Zingara Staff is installed",
      steps: [
        "Open Zingara Staff from your Home Screen or apps.",
        "Sign in with your individual staff account.",
        "Enable notifications below on devices you personally use.",
      ],
    };
  }

  if (platform === "ios") {
    return {
      actionLabel: null,
      heading: "Install on iPhone or iPad",
      steps: [
        "Open Quick Start in Safari.",
        "Tap Share.",
        "Tap Add to Home Screen.",
        "Confirm the app name is Zingara Staff.",
        "Open Zingara Staff from your Home Screen.",
        "Enable notifications from the installed app.",
      ],
    };
  }

  if (platform === "android") {
    return {
      actionLabel: canPromptInstall ? "Install Zingara Staff" : null,
      heading: "Install on Android",
      steps: canPromptInstall
        ? [
            "Tap Install Zingara Staff below.",
            "Open Zingara Staff from your Home Screen or apps.",
            "Allow notifications when you deliberately enable them below.",
          ]
        : [
            "Open your browser menu and choose Install app or Add to Home screen if offered.",
            "Confirm the app name is Zingara Staff, then open it.",
            "Allow notifications when you deliberately enable them below.",
          ],
    };
  }

  return {
    actionLabel: canPromptInstall ? "Install Zingara Staff" : null,
    heading: canPromptInstall ? "Install on this computer" : "Save for quick access",
    steps: canPromptInstall
      ? [
          "Select Install Zingara Staff below.",
          "Open Zingara Staff from your apps or desktop.",
          "Enable notifications below and allow them in your browser or system settings.",
        ]
      : [
          "Bookmark the Admin or Quick Start page.",
          "Use that bookmark for your next shift.",
          "Enable notifications below if this browser supports them.",
        ],
  };
}

export function getNotificationSetupPresentation(status?: PushDeviceStatus) {
  switch (status) {
    case "enabled":
      return { canEnable: false, label: "Notifications Enabled" };
    case "blocked":
      return { canEnable: false, label: "Notifications Blocked" };
    case "unsupported":
      return { canEnable: false, label: "Notifications Not Supported" };
    case "ios-install-required":
      return { canEnable: false, label: "Notifications Not Enabled" };
    case "not-enabled":
      return { canEnable: true, label: "Notifications Not Enabled" };
    default:
      return { canEnable: false, label: "Checking Notifications" };
  }
}

export function getBlockedNotificationGuidance(platform: DeviceSetupPlatform) {
  if (platform === "ios") {
    return "Open iPhone or iPad Settings, choose Notifications, then allow notifications for Zingara.";
  }

  if (platform === "android") {
    return "Open your device or browser site settings and allow notifications for Zingara.";
  }

  return "Open your browser and computer notification settings, then allow notifications for Zingara.";
}
