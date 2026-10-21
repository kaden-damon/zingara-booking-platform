export const platformFeedbackCampaignKey = "booking-experience-2026-10";
export const platformFeedbackCampaignStatus = "awaiting_approval" as const;
export const platformFeedbackSubject = "A little something from behind the curtain… ✨";
export const platformFeedbackHeading = "A LITTLE NOTE FROM THE ZINGARA FAMILY";
export const platformFeedbackCta = "SHARE YOUR THOUGHTS ✨";
export const platformFeedbackCommentMaximumLength = 2000;
export const platformFeedbackBody = `Dearest {{first_name}},

Every extraordinary Zingara experience begins long before the curtain rises. It begins with a little anticipation, a touch of excitement and, of course, securing your place at our table.

And that's where we'd love your thoughts.

We've been adding a little more magic behind the scenes, and we'd love to know how you found booking your tickets with us.

Was it all smooth sailing? Was everything easy to find? Or is there a little something we could do to make the experience even more wonderful?

Your thoughts help us make the magic happen, even before the show begins.

It'll only take a moment, we promise.

{{feedback_url}}

With love, laughter & a little Zingara magic,

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
  comment?: unknown;
  contactRequested?: unknown;
  rating?: unknown;
}) {
  const rating = Number(input.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { error: "Choose a rating from one to five stars." } as const;
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
  return { value: { comment: comment || null, contactRequested, rating } } as const;
}
