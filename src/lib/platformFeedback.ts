export const platformFeedbackCampaignKey = "booking-experience-2026-10";
export const platformFeedbackCampaignStatus = "awaiting_approval" as const;
export const platformFeedbackSubject = "A little favour from Zingara ✨";
export const platformFeedbackHeading = "WE'D LOVE YOUR THOUGHTS";
export const platformFeedbackCta = "SHARE YOUR THOUGHTS";
export const platformFeedbackCommentMaximumLength = 2000;
export const platformFeedbackBody = `Dearest {{first_name}},

A little magic happens long before the curtain rises, and we'd love to know how you found booking your Zingara experience.

Was it effortless, or could we have made things a little easier?

Your thoughts will help us make every Zingara experience even more wonderful.

{{feedback_url}}

With love,

The Zingara Family`;

export type PlatformFeedbackEmailTemplate = {
  body: string;
  cta: string;
  heading: string;
  subject: string;
};

export const defaultPlatformFeedbackEmailTemplate: PlatformFeedbackEmailTemplate = {
  body: platformFeedbackBody,
  cta: platformFeedbackCta,
  heading: platformFeedbackHeading,
  subject: platformFeedbackSubject,
};

const htmlMarkupPattern = /<\/?[a-z][^>]*>/i;
const blockedControlCharacterPattern = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

export type PlatformFeedbackCandidate = {
  archivedAt: string | null;
  bookingId: string;
  bookingOrigin: string | null;
  bookingSource: string | null;
  bookingStatus: string;
  customerId: string | null;
  email: string | null;
  firstName: string | null;
  paymentStatus: string;
  showId: string;
  venue: string;
};

export function normalizePlatformFeedbackEmail(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

export function getPlatformFeedbackEligibilityReason(candidate: PlatformFeedbackCandidate) {
  if (candidate.bookingOrigin !== "customer_public" || candidate.bookingSource !== "online") {
    return "not_customer_initiated" as const;
  }
  if (candidate.archivedAt) return "archived" as const;
  if (["cancelled", "refunded", "waitlisted", "no_show"].includes(candidate.bookingStatus)) {
    return "ineligible_lifecycle" as const;
  }
  if (["cancelled", "refunded", "reversed"].includes(candidate.paymentStatus)) {
    return "ineligible_payment" as const;
  }
  if (!candidate.customerId || !candidate.showId) return "missing_identity" as const;
  if (!["cape-town", "johannesburg"].includes(candidate.venue)) {
    return "unsupported_venue" as const;
  }
  const email = normalizePlatformFeedbackEmail(candidate.email);
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return "invalid_email" as const;
  }
  return null;
}

export function dedupePlatformFeedbackCandidates(candidates: PlatformFeedbackCandidate[]) {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (getPlatformFeedbackEligibilityReason(candidate)) return false;
    const email = normalizePlatformFeedbackEmail(candidate.email);
    if (seen.has(email)) return false;
    seen.add(email);
    return true;
  });
}

export function platformFeedbackGreeting(firstName: string | null | undefined) {
  const normalized = firstName?.trim().replace(/\s+/g, " ") ?? "";
  return normalized ? `Dearest ${normalized},` : "Dearest Zingarian,";
}

export function platformFeedbackMessage(
  firstName: string | null | undefined,
  feedbackUrl: string,
  body = platformFeedbackBody,
) {
  const fallbackName = platformFeedbackGreeting(firstName).replace(/^Dearest\s+|,$/g, "");
  return body
    .replaceAll("{{first_name}}", fallbackName)
    .replaceAll("{{feedback_url}}", feedbackUrl);
}

export function validatePlatformFeedbackEmailTemplate(input: Partial<PlatformFeedbackEmailTemplate>) {
  const subject = input.subject?.trim() ?? "";
  const heading = input.heading?.trim() ?? "";
  const body = input.body?.trim() ?? "";
  const cta = input.cta?.trim() ?? "";
  if (!subject || subject.length > 200) return { error: "Enter an email subject under 200 characters." } as const;
  if (!heading || heading.length > 200) return { error: "Enter an email heading under 200 characters." } as const;
  if (!body || body.length > 5000) return { error: "Enter email wording under 5,000 characters." } as const;
  if (!cta || cta.length > 80) return { error: "Enter CTA wording under 80 characters." } as const;
  if (htmlMarkupPattern.test(body) || blockedControlCharacterPattern.test(body)) {
    return { error: "Use plain text only for the email wording." } as const;
  }
  if (!body.includes("{{feedback_url}}")) {
    return { error: "The email body must keep the secure {{feedback_url}} link." } as const;
  }
  return { value: { body, cta, heading, subject } } as const;
}

export function validatePlatformFeedbackSubmission(input: {
  bookingDevice?: unknown;
  checkoutEase?: unknown;
  comment?: unknown;
  contactRequested?: unknown;
  paymentConfidence?: unknown;
  rating?: unknown;
  seatingEase?: unknown;
  showDateEase?: unknown;
}) {
  const rating = Number(input.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { error: "Choose an overall booking experience rating." } as const;
  }
  const showDateEase = Number(input.showDateEase);
  const seatingEase = Number(input.seatingEase);
  const checkoutEase = Number(input.checkoutEase);
  if (![showDateEase, seatingEase, checkoutEase].every((value) => Number.isInteger(value) && value >= 1 && value <= 5)) {
    return { error: "Answer each booking experience question before submitting." } as const;
  }
  const paymentConfidence = typeof input.paymentConfidence === "string" ? input.paymentConfidence : "";
  if (!["yes", "mostly", "no"].includes(paymentConfidence)) {
    return { error: "Tell us whether you felt safe making your payment online." } as const;
  }
  const bookingDevice = typeof input.bookingDevice === "string" ? input.bookingDevice : "";
  if (!["mobile", "computer", "tablet", "cant_remember"].includes(bookingDevice)) {
    return { error: "Choose the device used to make the booking." } as const;
  }
  const comment = typeof input.comment === "string" ? input.comment.trim() : "";
  if (
    comment.length > platformFeedbackCommentMaximumLength ||
    htmlMarkupPattern.test(comment) ||
    blockedControlCharacterPattern.test(comment)
  ) {
    return { error: "Keep your feedback to 2,000 characters and use plain text only." } as const;
  }
  const contactRequested = rating <= 3 && input.contactRequested === true;
  return {
    value: {
      bookingDevice: bookingDevice as "mobile" | "computer" | "tablet" | "cant_remember",
      checkoutEase,
      comment: comment || null,
      contactRequested,
      paymentConfidence: paymentConfidence as "yes" | "mostly" | "no",
      rating,
      seatingEase,
      showDateEase,
    },
  } as const;
}
