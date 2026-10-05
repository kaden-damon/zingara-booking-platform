import crypto from "node:crypto";

export const reviewTextMinimumLength = 20;
export const reviewTextMaximumLength = 2000;
export const reviewInvitationLifetimeDays = 30;

export type ReviewModerationStatus =
  | "needs_review"
  | "not_published"
  | "published";

export type ReviewModerationAction =
  | "do_not_publish"
  | "publish"
  | "unpublish";

export type ReviewEligibilityInput = {
  archivedAt: string | null;
  bookingReference: string;
  bookingStatus: string;
  paymentStatus: string;
  showDate: string;
  showTime: string;
};

export type PublicReviewRecord = {
  featured: boolean;
  id: string;
  publicDisplayName: string;
  publishedAt: string;
  publicationConsent: boolean;
  rating: number;
  reviewText: string;
  status: ReviewModerationStatus;
  venue: string;
  verifiedGuest: boolean;
};

export type PublicReviewFilters = {
  featured: true | null;
  limit: number;
  page: number;
  venue: "cape-town" | "johannesburg" | null;
};

export type PublicReviewAggregates = {
  averageRating: number;
  publishedCount: number;
  ratingDistribution: Record<1 | 2 | 3 | 4 | 5, number>;
  venues: Record<string, { averageRating: number; publishedCount: number }>;
};

export type PublicReviewPayload = {
  displayName: string;
  featured: boolean;
  publicReviewId: string;
  publishedAt: string;
  rating: number;
  reviewText: string;
  venue: string;
  verifiedGuest: boolean;
  guestType: "invited" | "verified";
};

export type PublicReviewsResponse = {
  aggregates: PublicReviewAggregates;
  contractVersion: typeof publicReviewContractVersion;
  pagination: {
    hasMore: boolean;
    limit: number;
    page: number;
    totalPages: number;
    totalReviews: number;
  };
  reviews: PublicReviewPayload[];
};

export function getReviewGuestType(input: {
  checkedIn: boolean;
  invitationType: "automated_verified" | "manual_email" | "manual_link";
}) {
  return input.invitationType === "automated_verified" && input.checkedIn
    ? "verified" as const
    : "invited" as const;
}

// guestType is an additive field; retain 1.0 so the installed Wix backend
// continues accepting the feed without a Wix deployment.
export const publicReviewContractVersion = "1.0";
export const publicReviewDefaultLimit = 12;
export const publicReviewMaximumLimit = 24;
export const publicReviewMaximumPage = 500;

const htmlMarkupPattern = /<\/?[a-z][^>]*>/i;
const blockedControlCharacterPattern = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

export function createReviewToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashReviewToken(token: string) {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

export function buildVerifiedReviewUrl(origin: string, token: string) {
  const base = origin.replace(/\/$/, "");
  return `${base}/review/${encodeURIComponent(token)}`;
}

export function getReviewPreviewUrl(origin: string) {
  return `${origin.replace(/\/$/, "")}/review/preview`;
}

export function getSafePublicDisplayName(input: {
  firstName?: string | null;
  surname?: string | null;
}) {
  const firstName = input.firstName?.trim();
  const surname = input.surname?.trim();

  if (!firstName) return "Zingara Guest";
  if (!surname) return firstName.slice(0, 60);

  return `${firstName.slice(0, 60)} ${surname.charAt(0).toUpperCase()}.`;
}

export function getSafePublicDisplayNameFromFullName(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) return "Zingara Guest";
  if (parts.length === 1) return parts[0].slice(0, 60);
  return `${parts[0].slice(0, 60)} ${parts.at(-1)!.charAt(0).toUpperCase()}.`;
}

export function validateReviewSubmission(input: {
  contactRequested: unknown;
  publicationConsent: unknown;
  rating: unknown;
  reviewText: unknown;
}) {
  const rating = Number(input.rating);
  const reviewText = typeof input.reviewText === "string" ? input.reviewText.trim() : "";

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { error: "Choose a star rating before submitting your review." } as const;
  }

  if (
    reviewText.length < reviewTextMinimumLength ||
    reviewText.length > reviewTextMaximumLength
  ) {
    return {
      error: `Your review must be between ${reviewTextMinimumLength} and ${reviewTextMaximumLength} characters.`,
    } as const;
  }

  if (htmlMarkupPattern.test(reviewText) || blockedControlCharacterPattern.test(reviewText)) {
    return { error: "Please enter your review as plain text." } as const;
  }

  return {
    value: {
      contactRequested: input.contactRequested === true,
      publicationConsent: input.publicationConsent === true,
      rating,
      reviewText,
    },
  } as const;
}

export function getReviewEligibilityReason(
  input: ReviewEligibilityInput,
  now = new Date(),
) {
  if (input.archivedAt) return "archived";
  if (["cancelled", "refunded", "waitlisted", "no_show"].includes(input.bookingStatus)) {
    return input.bookingStatus;
  }
  if (["cancelled", "refunded"].includes(input.paymentStatus)) {
    return input.paymentStatus;
  }
  if (/^(qa|test|demo)[-_]/i.test(input.bookingReference.trim())) {
    return "synthetic_booking";
  }

  const showTime = input.showTime.slice(0, 5) || "00:00";
  const performance = new Date(`${input.showDate}T${showTime}:00+02:00`);

  if (Number.isNaN(performance.getTime()) || performance >= now) {
    return "show_not_completed";
  }
  return null;
}

export function canPublishReview(input: {
  action: ReviewModerationAction;
  publicationConsent: boolean;
  status: ReviewModerationStatus;
}) {
  if (input.action === "publish") {
    return input.publicationConsent && input.status !== "published";
  }
  if (input.action === "unpublish") return input.status === "published";
  return input.status !== "not_published";
}

export function parsePublicReviewFilters(searchParams: URLSearchParams) {
  const allowed = new Set(["featured", "limit", "page", "venue"]);
  const unknown = [...searchParams.keys()].find((key) => !allowed.has(key));
  if (unknown) return { error: `Unsupported filter: ${unknown}.` } as const;

  const venue = searchParams.get("venue");
  if (venue && venue !== "cape-town" && venue !== "johannesburg") {
    return { error: "Invalid venue." } as const;
  }

  const featuredValue = searchParams.get("featured");
  if (featuredValue !== null && featuredValue !== "true") {
    return { error: "The featured filter only accepts true." } as const;
  }

  const limitValue = searchParams.get("limit");
  const pageValue = searchParams.get("page");
  const limit = limitValue === null ? publicReviewDefaultLimit : Number(limitValue);
  const page = pageValue === null ? 1 : Number(pageValue);
  if (!Number.isInteger(limit) || limit < 1 || limit > publicReviewMaximumLimit) {
    return { error: `Limit must be between 1 and ${publicReviewMaximumLimit}.` } as const;
  }
  if (!Number.isInteger(page) || page < 1 || page > publicReviewMaximumPage) {
    return { error: `Page must be between 1 and ${publicReviewMaximumPage}.` } as const;
  }

  return {
    value: {
      featured: featuredValue === "true" ? true : null,
      limit,
      page,
      venue: venue as PublicReviewFilters["venue"],
    },
  } as const;
}

export function toPublicReviewPayload(record: PublicReviewRecord): PublicReviewPayload | null {
  if (record.status !== "published" || !record.publicationConsent) return null;

  return {
    displayName: record.publicDisplayName,
    featured: record.featured,
    publicReviewId: record.id,
    publishedAt: record.publishedAt,
    rating: record.rating,
    reviewText: record.reviewText,
    venue: record.venue,
    verifiedGuest: record.verifiedGuest,
    guestType: record.verifiedGuest ? "verified" : "invited",
  };
}

export function getVisiblePublicReviews(
  records: PublicReviewRecord[],
  filters: PublicReviewFilters,
) {
  const visible = records
    .filter(
      (record) =>
        record.status === "published" &&
        record.publicationConsent &&
        (!filters.venue || record.venue === filters.venue) &&
        (!filters.featured || record.featured),
    )
    .sort((left, right) => right.publishedAt.localeCompare(left.publishedAt));
  const from = (filters.page - 1) * filters.limit;

  return {
    records: visible.slice(from, from + filters.limit),
    total: visible.length,
  };
}

export function getPublishedReviewAggregates(records: PublicReviewRecord[]) {
  const published = records.filter(
    (record) => record.status === "published" && record.publicationConsent,
  );
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<1 | 2 | 3 | 4 | 5, number>;
  const venues: Record<string, { averageRating: number; count: number; total: number }> = {};

  for (const review of published) {
    distribution[review.rating as 1 | 2 | 3 | 4 | 5] += 1;
    const venue = venues[review.venue] ?? { averageRating: 0, count: 0, total: 0 };
    venue.count += 1;
    venue.total += review.rating;
    venue.averageRating = venue.total / venue.count;
    venues[review.venue] = venue;
  }

  return {
    averageRating: published.length
      ? Number(
          (
            published.reduce((sum, review) => sum + review.rating, 0) /
            published.length
          ).toFixed(2),
        )
      : 0,
    publishedCount: published.length,
    ratingDistribution: distribution,
    venues: Object.fromEntries(
      Object.entries(venues).map(([venue, values]) => [
        venue,
        {
          averageRating: Number(values.averageRating.toFixed(2)),
          publishedCount: values.count,
        },
      ]),
    ),
  } satisfies PublicReviewAggregates;
}
