import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node's built-in TypeScript test runner requires the extension.
import {
  detectDeviceSetupPlatform,
  getBlockedNotificationGuidance,
  getDeviceInstallGuidance,
  getNotificationSetupPresentation,
} from "./quickStartDeviceSetup.ts";

test("detects iOS, iPadOS, Android, and desktop devices", () => {
  assert.equal(
    detectDeviceSetupPlatform({ userAgent: "Mozilla/5.0 (iPhone)" }),
    "ios",
  );
  assert.equal(
    detectDeviceSetupPlatform({
      maxTouchPoints: 5,
      platform: "MacIntel",
      userAgent: "Mozilla/5.0 (Macintosh)",
    }),
    "ios",
  );
  assert.equal(
    detectDeviceSetupPlatform({ userAgent: "Mozilla/5.0 (Linux; Android 15)" }),
    "android",
  );
  assert.equal(
    detectDeviceSetupPlatform({ userAgent: "Mozilla/5.0 (Macintosh)" }),
    "desktop",
  );
});

test("uses manual iOS installation guidance without a false install action", () => {
  const guidance = getDeviceInstallGuidance({
    canPromptInstall: false,
    isInstalled: false,
    platform: "ios",
  });

  assert.equal(guidance.actionLabel, null);
  assert.match(
    guidance.steps.join(" "),
    /Safari.*Share.*Add to Home Screen.*Zingara Staff.*notifications/,
  );
});

test("offers the captured install action on supported Android and desktop browsers", () => {
  for (const platform of ["android", "desktop"] as const) {
    assert.equal(
      getDeviceInstallGuidance({
        canPromptInstall: true,
        isInstalled: false,
        platform,
      }).actionLabel,
      "Install Zingara Staff",
    );
  }
});

test("falls back to truthful manual or bookmark guidance", () => {
  assert.match(
    getDeviceInstallGuidance({
      canPromptInstall: false,
      isInstalled: false,
      platform: "android",
    }).steps[0],
    /if offered/,
  );
  assert.match(
    getDeviceInstallGuidance({
      canPromptInstall: false,
      isInstalled: false,
      platform: "desktop",
    }).steps[0],
    /Bookmark/,
  );
});

test("reports an already installed app without another install action", () => {
  const guidance = getDeviceInstallGuidance({
    canPromptInstall: true,
    isInstalled: true,
    platform: "android",
  });

  assert.equal(guidance.heading, "Zingara Staff is installed");
  assert.equal(guidance.actionLabel, null);
});

test("maps all existing push states to the approved staff-facing statuses", () => {
  assert.deepEqual(getNotificationSetupPresentation("enabled"), {
    canEnable: false,
    label: "Notifications Enabled",
  });
  assert.deepEqual(getNotificationSetupPresentation("not-enabled"), {
    canEnable: true,
    label: "Notifications Not Enabled",
  });
  assert.equal(
    getNotificationSetupPresentation("blocked").label,
    "Notifications Blocked",
  );
  assert.equal(
    getNotificationSetupPresentation("unsupported").label,
    "Notifications Not Supported",
  );
  assert.equal(
    getNotificationSetupPresentation("ios-install-required").canEnable,
    false,
  );
});

test("provides platform-appropriate blocked permission guidance", () => {
  assert.match(getBlockedNotificationGuidance("ios"), /iPhone or iPad Settings/);
  assert.match(getBlockedNotificationGuidance("android"), /device or browser/);
  assert.match(getBlockedNotificationGuidance("desktop"), /computer notification/);
});
