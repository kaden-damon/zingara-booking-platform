"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { AdminCollapsibleSection } from "@/app/admin/AdminCollapsibleSection";
import {
  getZingaraPushDeviceStatus,
  registerZingaraPushSubscription,
  type PushDeviceStatusResult,
} from "@/lib/browserNotifications";
import {
  detectDeviceSetupPlatform,
  getBlockedNotificationGuidance,
  getDeviceInstallGuidance,
  getNotificationSetupPresentation,
  type DeviceSetupPlatform,
} from "@/lib/quickStartDeviceSetup";
import {
  clearPwaInstallPrompt,
  subscribeToPwaInstallPrompt,
  type PwaInstallPromptEvent,
} from "@/lib/pwaInstallPrompt";

const primaryButtonClass =
  "inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-[#D8C36A] px-5 py-3 text-center text-xs font-bold uppercase tracking-[0.12em] text-black transition hover:bg-[#F2D66C] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F2D66C] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto";
const secondaryButtonClass =
  "inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-white/15 bg-black/35 px-4 py-3 text-center text-xs font-semibold uppercase tracking-[0.1em] text-zinc-200 transition hover:border-[#D8C36A]/60 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F2D66C] sm:w-auto";

function getInstalledState() {
  const navigatorWithStandalone = window.navigator as Navigator & {
    standalone?: boolean;
  };

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    navigatorWithStandalone.standalone === true
  );
}

function detectPlatform(): DeviceSetupPlatform {
  return detectDeviceSetupPlatform({
    maxTouchPoints: window.navigator.maxTouchPoints,
    platform: window.navigator.platform,
    userAgent: window.navigator.userAgent,
  });
}

export function QuickStartDeviceSetup() {
  const [installPrompt, setInstallPrompt] =
    useState<PwaInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [platform, setPlatform] = useState<DeviceSetupPlatform>("desktop");
  const [notificationStatus, setNotificationStatus] =
    useState<PushDeviceStatusResult | null>(null);
  const [isNotificationStatusLoading, setIsNotificationStatusLoading] =
    useState(true);
  const [isNotificationSubmitting, setIsNotificationSubmitting] =
    useState(false);
  const [notificationError, setNotificationError] = useState("");
  const [isInstallSubmitting, setIsInstallSubmitting] = useState(false);

  useEffect(() => {
    setPlatform(detectPlatform());
    setIsInstalled(getInstalledState());
    const unsubscribe = subscribeToPwaInstallPrompt(setInstallPrompt);

    function handleAppInstalled() {
      setIsInstalled(true);
    }

    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      unsubscribe();
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  async function refreshNotificationStatus() {
    setIsNotificationStatusLoading(true);

    try {
      setNotificationStatus(await getZingaraPushDeviceStatus());
    } catch {
      setNotificationStatus(null);
      setNotificationError("Notification status could not be checked.");
    } finally {
      setIsNotificationStatusLoading(false);
    }
  }

  useEffect(() => {
    void refreshNotificationStatus();
  }, []);

  const installGuidance = useMemo(
    () =>
      getDeviceInstallGuidance({
        canPromptInstall: Boolean(installPrompt),
        isInstalled,
        platform,
      }),
    [installPrompt, isInstalled, platform],
  );
  const notificationPresentation = getNotificationSetupPresentation(
    notificationStatus?.status,
  );

  async function installApp() {
    if (!installPrompt || isInstallSubmitting) {
      return;
    }

    setIsInstallSubmitting(true);

    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;

      if (choice.outcome === "accepted") {
        clearPwaInstallPrompt();
      }
    } finally {
      setIsInstallSubmitting(false);
    }
  }

  async function enableNotifications() {
    if (isNotificationSubmitting) {
      return;
    }

    setIsNotificationSubmitting(true);
    setNotificationError("");

    try {
      const result = await registerZingaraPushSubscription();

      if (!result.ok) {
        setNotificationError(
          result.permission === "denied"
            ? getBlockedNotificationGuidance(platform)
            : result.reason ?? "Notifications could not be enabled.",
        );
      }

      await refreshNotificationStatus();
    } finally {
      setIsNotificationSubmitting(false);
    }
  }

  const statusTone =
    notificationStatus?.status === "enabled"
      ? "border-emerald-300/30 bg-emerald-950/25 text-emerald-200"
      : notificationStatus?.status === "blocked"
        ? "border-amber-300/35 bg-amber-950/25 text-amber-100"
        : "border-white/10 bg-black/35 text-zinc-300";

  return (
    <section id="device-setup" className="mt-4 scroll-mt-4">
      <AdminCollapsibleSection
        defaultOpen
        title="Set Up Your Device"
        summary="Install Zingara Staff for quicker Admin access and enable notifications so you don't miss relevant operational updates."
      >
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-black/35 p-4 sm:p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#D8C36A]">
                Install Zingara Staff
              </p>
              <p className="mt-2 text-sm leading-6 text-zinc-300">
                Add Zingara Staff to your Home Screen for quick access to
                Admin, Quick Start and staff notifications.
              </p>
              <h3 className="mt-2 text-lg font-bold text-white">
                {installGuidance.heading}
              </h3>
              <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-6 text-zinc-300 marker:font-semibold marker:text-[#D8C36A]">
                {installGuidance.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              {installGuidance.actionLabel && (
                <button
                  type="button"
                  disabled={isInstallSubmitting}
                  onClick={() => void installApp()}
                  className={`${primaryButtonClass} mt-4`}
                >
                  {isInstallSubmitting
                    ? "Opening Install..."
                    : installGuidance.actionLabel}
                </button>
              )}
            </div>

            <div className={`rounded-xl border p-4 sm:p-5 ${statusTone}`}>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#D8C36A]">
                Staff Notifications
              </p>
              <p
                role="status"
                aria-live="polite"
                className="mt-2 text-lg font-bold uppercase"
              >
                {isNotificationStatusLoading
                  ? "Checking Notifications"
                  : notificationPresentation.label}
              </p>
              <p className="mt-3 text-sm leading-6 text-current/85">
                {notificationStatus?.message ??
                  "Checking whether notifications are available on this device."}
              </p>
              {notificationStatus?.status === "blocked" && (
                <p className="mt-3 text-sm leading-6 text-amber-100">
                  {getBlockedNotificationGuidance(platform)}
                </p>
              )}
              {notificationError && (
                <p className="mt-3 text-sm font-semibold leading-6 text-amber-100">
                  {notificationError}
                </p>
              )}
              {notificationPresentation.canEnable &&
                !isNotificationStatusLoading && (
                  <button
                    type="button"
                    disabled={isNotificationSubmitting}
                    onClick={() => void enableNotifications()}
                    className={`${primaryButtonClass} mt-4`}
                  >
                    {isNotificationSubmitting
                      ? "Enabling..."
                      : "Enable Notifications"}
                  </button>
                )}
            </div>
          </div>

          <div className="rounded-xl border border-amber-300/30 bg-amber-950/20 p-4 text-sm leading-6 text-amber-50">
            <p className="font-semibold">Already installed Zingara before?</p>
            <p className="mt-1 text-amber-50/85">
              If that Home Screen icon still opens the public booking page,
              remove only that old staff/test installation. Then reopen Quick
              Start in Safari and install Zingara Staff again. You can keep the
              public customer app if you use it.
            </p>
          </div>

          <div className="rounded-xl border border-white/10 bg-zinc-950/70 p-4 text-sm leading-6 text-zinc-300">
            <p>
              Notifications allow Zingara to alert you to relevant operational
              activity based on your staff access. Only enable them on devices
              you personally use for Zingara.
            </p>
            <p className="mt-2 font-semibold text-white">
              Only enable staff notifications on a device you trust. Sign out
              of Zingara on shared devices.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
            <Link href="/admin" className={secondaryButtonClass}>
              Open Admin
            </Link>
            <Link href="/admin/quick-start" className={secondaryButtonClass}>
              Open Quick Start
            </Link>
          </div>
        </div>
      </AdminCollapsibleSection>
    </section>
  );
}
