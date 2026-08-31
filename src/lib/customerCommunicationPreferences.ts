export type OperationalCommunicationChannel = "email" | "push";

export type OperationalPauseDuration = "1-hour" | "4-hours" | "24-hours";

export type MarketingConsentState =
  | "not-subscribed"
  | "subscribed"
  | "unknown";

export type OperationalCommunicationKind =
  | "booking_confirmation"
  | "booking_update"
  | "cancellation_notice"
  | "custom_message"
  | "payment_confirmation"
  | "payment_link"
  | "post_show_review"
  | "refund_confirmation"
  | "show_reminder"
  | "ticket_resend"
  | "waitlist_update";

export type CustomerCommunicationSuppression = {
  channel: OperationalCommunicationChannel;
  customerId: string;
  pausedAt: string;
  pausedByName: string;
  pausedUntil: string;
  reason: string;
};

export const operationalPauseReasons = [
  "Updating booking details",
  "Customer requested temporary pause",
  "Correcting imported booking",
  "Other",
] as const;

export const operationalPauseDurations: Array<{
  label: string;
  value: OperationalPauseDuration;
}> = [
  { label: "1 hour", value: "1-hour" },
  { label: "4 hours", value: "4-hours" },
  { label: "24 hours", value: "24-hours" },
];

const pauseDurationHours: Record<OperationalPauseDuration, number> = {
  "1-hour": 1,
  "4-hours": 4,
  "24-hours": 24,
};

const bypassPauseKinds = new Set<OperationalCommunicationKind>([
  "cancellation_notice",
  "payment_confirmation",
  "payment_link",
  "refund_confirmation",
  "ticket_resend",
]);

export function shouldRespectCustomerOperationalPause(
  kind: OperationalCommunicationKind,
) {
  return !bypassPauseKinds.has(kind);
}

export function canViewCustomerCommunicationState(
  permissions: readonly string[],
) {
  return permissions.includes("crm:read");
}

export function canManageCustomerCommunicationState(
  permissions: readonly string[],
) {
  return (
    canViewCustomerCommunicationState(permissions) &&
    permissions.includes("communications:manage")
  );
}

export function getOperationalPauseExpiry(
  duration: OperationalPauseDuration,
  now = new Date(),
) {
  return new Date(
    now.getTime() + pauseDurationHours[duration] * 60 * 60 * 1000,
  ).toISOString();
}

export function isOperationalSuppressionActive(
  suppression: Pick<CustomerCommunicationSuppression, "pausedUntil"> | null,
  now = new Date(),
) {
  if (!suppression) {
    return false;
  }

  const pausedUntil = new Date(suppression.pausedUntil).getTime();

  return Number.isFinite(pausedUntil) && pausedUntil > now.getTime();
}

export function getActiveOperationalSuppression(
  suppressions: CustomerCommunicationSuppression[],
  channel: OperationalCommunicationChannel,
  now = new Date(),
) {
  return (
    suppressions.find(
      (suppression) =>
        suppression.channel === channel &&
        isOperationalSuppressionActive(suppression, now),
    ) ?? null
  );
}

export function resolveCustomerOperationalCommunication(
  suppressions: CustomerCommunicationSuppression[],
  input: {
    channel: OperationalCommunicationChannel;
    kind: OperationalCommunicationKind;
    now?: Date;
  },
) {
  if (!shouldRespectCustomerOperationalPause(input.kind)) {
    return {
      allowed: true,
      reason: null,
      suppression: null,
    } as const;
  }

  const suppression = getActiveOperationalSuppression(
    suppressions,
    input.channel,
    input.now,
  );

  return suppression
    ? {
        allowed: false,
        reason: `${input.channel} operational updates are temporarily paused.`,
        suppression,
      }
    : {
        allowed: true,
        reason: null,
        suppression: null,
      };
}

export function normalizeMarketingConsentEvidence(
  value: string | null | undefined,
): MarketingConsentState {
  const normalized = value?.trim().toLowerCase();

  if (
    normalized === "subscribed" ||
    normalized === "yes" ||
    normalized === "true" ||
    normalized === "opted in" ||
    normalized === "opt-in"
  ) {
    return "subscribed";
  }

  if (
    normalized === "not subscribed" ||
    normalized === "no" ||
    normalized === "false" ||
    normalized === "opted out" ||
    normalized === "opt-out" ||
    normalized === "unsubscribed"
  ) {
    return "not-subscribed";
  }

  return "unknown";
}

export function getOperationalPauseReason(
  reason: string,
  otherReason: string,
) {
  if (reason !== "Other") {
    return reason.trim();
  }

  return otherReason.trim();
}
