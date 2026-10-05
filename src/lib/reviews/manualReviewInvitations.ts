import {
  getReviewEligibilityReason,
  getSafePublicDisplayNameFromFullName,
} from "@/lib/reviews/reviews";

export const manualReviewInvitationLimitPerHour = 12;

export function normalizeReviewRecipientEmail(value: string) {
  return value.trim().toLowerCase();
}

export function validateManualReviewRecipient(input: {
  action: "create_link" | "send_email";
  email?: unknown;
  name?: unknown;
}) {
  const name = typeof input.name === "string" ? input.name.trim().replace(/\s+/g, " ") : "";
  const email = typeof input.email === "string" ? normalizeReviewRecipientEmail(input.email) : "";

  if (name.length < 2 || name.length > 100) {
    return { error: "Enter the attendee's name." } as const;
  }

  if (
    input.action === "send_email" &&
    (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
  ) {
    return { error: "Enter a valid email address." } as const;
  }

  return {
    value: {
      email: email || null,
      name,
      publicDisplayName: getSafePublicDisplayNameFromFullName(name),
    },
  } as const;
}

export function getManualReviewEligibilityReason(input: {
  archivedAt: string | null;
  bookingReference: string;
  bookingStatus: string;
  paymentStatus: string;
  showDate: string;
  showTime: string;
}, now = new Date()) {
  return getReviewEligibilityReason(input, now);
}
