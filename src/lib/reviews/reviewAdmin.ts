import { canPublishReview, getAnonymousReviewIdentityWarnings } from "./reviews.ts";

export type ReviewContactFilter = "all" | "contact_requested" | "contacted" | "not_contacted";
export type ReviewPrivacyFilter = "all" | "private" | "public";
export type ReviewReplyFilter = "all" | "replied" | "not_replied";
export type ReviewVenueFilter = "all" | "cape-town" | "johannesburg";

export type ReviewAdminFilters = {
  contact: ReviewContactFilter;
  privacy: ReviewPrivacyFilter;
  rating: number | null;
  reply: ReviewReplyFilter;
  venue: ReviewVenueFilter;
};

const contactFilters = new Set<ReviewContactFilter>(["all", "contact_requested", "contacted", "not_contacted"]);
const privacyFilters = new Set<ReviewPrivacyFilter>(["all", "private", "public"]);
const replyFilters = new Set<ReviewReplyFilter>(["all", "replied", "not_replied"]);
const venueFilters = new Set<ReviewVenueFilter>(["all", "cape-town", "johannesburg"]);

export function parseReviewAdminFilters(searchParams: URLSearchParams) {
  const contact = searchParams.get("contact") ?? "all";
  const privacy = searchParams.get("privacy") ?? "all";
  const reply = searchParams.get("reply") ?? "all";
  const venue = searchParams.get("venue") ?? "all";
  const ratingValue = searchParams.get("rating") ?? "all";
  const rating = ratingValue === "all" ? null : Number(ratingValue);

  if (
    !contactFilters.has(contact as ReviewContactFilter) ||
    !privacyFilters.has(privacy as ReviewPrivacyFilter) ||
    !replyFilters.has(reply as ReviewReplyFilter) ||
    !venueFilters.has(venue as ReviewVenueFilter) ||
    (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 5))
  ) {
    return { error: "Choose valid review filters." } as const;
  }

  return {
    value: {
      contact: contact as ReviewContactFilter,
      privacy: privacy as ReviewPrivacyFilter,
      rating,
      reply: reply as ReviewReplyFilter,
      venue: venue as ReviewVenueFilter,
    } satisfies ReviewAdminFilters,
  } as const;
}

export function getReviewContactState(input: { contactedAt: string | null; contactRequested: boolean }) {
  if (input.contactedAt) return "contacted" as const;
  if (input.contactRequested) return "contact_requested" as const;
  return "not_contacted" as const;
}

export type BulkReviewCandidate = {
  id: string;
  publicationConsent: boolean;
  publicationConsentMode: "anonymous" | "private" | "public";
  publicationPolicyVersion: string | null;
  privacyRequested: boolean | null;
  publicDisplayName: string;
  reviewText: string;
  revision: number;
  status: "needs_review" | "not_published" | "published";
};

export function classifyBulkReview(candidate: BulkReviewCandidate) {
  if (canPublishReview({
    action: "publish",
    publicationConsent: candidate.publicationConsent,
    publicationConsentMode: candidate.publicationConsentMode,
    publicationPolicyVersion: candidate.publicationPolicyVersion,
    privacyRequested: candidate.privacyRequested,
    status: candidate.status,
  })) {
    return { action: "publish" as const, warnings: [] as string[] };
  }

  const anonymousAllowed = canPublishReview({
    action: "publish_anonymous",
    publicationConsent: candidate.publicationConsent,
    publicationConsentMode: candidate.publicationConsentMode,
    publicationPolicyVersion: candidate.publicationPolicyVersion,
    privacyRequested: candidate.privacyRequested,
    status: candidate.status,
  });
  const warnings = anonymousAllowed
    ? getAnonymousReviewIdentityWarnings(candidate.reviewText, candidate.publicDisplayName)
    : [];

  return anonymousAllowed && warnings.length === 0
    ? { action: "publish_anonymous" as const, warnings }
    : { action: null, warnings };
}
