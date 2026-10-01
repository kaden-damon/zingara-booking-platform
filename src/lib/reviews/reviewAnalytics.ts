import { getJohannesburgDateKey, type AnalyticsVenue } from "@/lib/managementAnalytics";

export type ReviewAnalyticsStatus =
  | "needs_review"
  | "not_published"
  | "published";

export type ReviewAnalyticsReview = {
  bookingId: string;
  contactRequested: boolean;
  displayName: string;
  featured: boolean;
  id: string;
  moderationStatus: ReviewAnalyticsStatus;
  publicationConsent: boolean;
  rating: number;
  reviewText: string;
  showId: string;
  submittedAt: string;
  unpublishedAt: string | null;
  venue: AnalyticsVenue;
};

export type ReviewAnalyticsShow = {
  date: string;
  id: string;
  name: string;
  time: string;
  venue: AnalyticsVenue;
};

export type ReviewAnalyticsEvidence = {
  attended: Array<{ bookingId: string; showId: string }>;
  invitations: Array<{ bookingId: string; showId: string }>;
  sent: Array<{ bookingId: string; showId: string }>;
};

export type ReviewAnalyticsFilters = {
  performanceFrom: string;
  performanceId: string;
  performanceTo: string;
  submittedFrom: string;
  submittedTo: string;
  venue: "all" | AnalyticsVenue;
};

export type RatingDistributionRow = {
  count: number;
  percentage: number;
  rating: 1 | 2 | 3 | 4 | 5;
};

export type ReviewAnalyticsFeedbackRow = {
  contactRequested: boolean;
  displayName: string;
  id: string;
  performanceDate: string;
  preview: string;
  rating: number;
  status: ReviewAnalyticsStatus;
  submittedAt: string;
  venue: AnalyticsVenue;
};

export type ReviewAnalyticsReport = {
  asOf: string;
  filters: ReviewAnalyticsFilters;
  funnel: {
    attended: number;
    invitationCreated: number;
    mailerAccepted: number;
    published: number;
    submitted: number;
  };
  kpis: {
    consentRate: number | null;
    contactRequested: number;
    featured: number;
    guestRating: number | null;
    needsReview: number;
    notPublished: number;
    publicRating: number | null;
    publicationRate: number | null;
    publishedReviews: number;
    responseRate: number | null;
    reviewsReceived: number;
    unpublished: number;
  };
  lowRatings: ReviewAnalyticsFeedbackRow[];
  moderation: {
    needsReview: number;
    notPublished: number;
    published: number;
    unpublished: number;
  };
  performance: Array<{
    contactRequested: number;
    date: string;
    guestRating: number | null;
    id: string;
    name: string;
    responseRate: number | null;
    reviewsReceived: number;
    time: string;
    venue: AnalyticsVenue;
  }>;
  publicDistribution: RatingDistributionRow[];
  ratingDistribution: RatingDistributionRow[];
  recentFeedback: ReviewAnalyticsFeedbackRow[];
  trend: Array<{
    guestRating: number | null;
    period: string;
    reviewsReceived: number;
  }>;
  trendGrain: "day" | "month" | "week";
  venueComparison: Array<{
    contactRequested: number;
    guestRating: number | null;
    publicRating: number | null;
    published: number;
    responseRate: number | null;
    reviewsReceived: number;
    venue: AnalyticsVenue;
  }>;
  workflow: {
    activatedAt: string | null;
    enabled: boolean;
    timingOffsetDays: number;
  };
};

export function hasPersistedReviewAttendance(
  bookingId: string,
  tickets: Array<{
    bookingId?: string;
    booking_id?: string;
    ticketStatus?: string;
    ticket_status?: string;
  }>,
) {
  return tickets.some(
    (ticket) =>
      (ticket.bookingId ?? ticket.booking_id) === bookingId &&
      (ticket.ticketStatus ?? ticket.ticket_status) === "checked_in",
  );
}

function average(values: number[]) {
  return values.length
    ? values.reduce((total, value) => total + value, 0) / values.length
    : null;
}

function rate(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : null;
}

function inRange(value: string, from: string, to: string) {
  return (!from || value >= from) && (!to || value <= to);
}

function distribution(reviews: ReviewAnalyticsReview[]) {
  return ([5, 4, 3, 2, 1] as const).map((rating) => {
    const count = reviews.filter((review) => review.rating === rating).length;
    return {
      count,
      percentage: reviews.length ? count / reviews.length : 0,
      rating,
    };
  });
}

function mondayKey(dateKey: string) {
  const date = new Date(`${dateKey}T12:00:00Z`);
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - (day === 0 ? 6 : day - 1));
  return date.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string) {
  if (!from || !to) return null;
  const left = new Date(`${from}T12:00:00Z`).getTime();
  const right = new Date(`${to}T12:00:00Z`).getTime();
  return Math.max(0, Math.round((right - left) / 86_400_000));
}

function trendGrain(filters: ReviewAnalyticsFilters) {
  const days = daysBetween(filters.submittedFrom, filters.submittedTo);
  if (days !== null && days <= 45) return "day" as const;
  if (days !== null && days <= 180) return "week" as const;
  return "month" as const;
}

function trendPeriod(submittedAt: string, grain: "day" | "month" | "week") {
  const date = getJohannesburgDateKey(submittedAt);
  if (grain === "day") return date;
  if (grain === "week") return mondayKey(date);
  return date.slice(0, 7);
}

function preview(text: string) {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > 180 ? `${compact.slice(0, 177)}...` : compact;
}

function feedbackRow(
  review: ReviewAnalyticsReview,
  shows: Map<string, ReviewAnalyticsShow>,
): ReviewAnalyticsFeedbackRow {
  return {
    contactRequested: review.contactRequested,
    displayName: review.displayName,
    id: review.id,
    performanceDate: shows.get(review.showId)?.date ?? "",
    preview: preview(review.reviewText),
    rating: review.rating,
    status: review.moderationStatus,
    submittedAt: review.submittedAt,
    venue: review.venue,
  };
}

export function calculateReviewAnalytics(input: {
  asOf: string;
  evidence: ReviewAnalyticsEvidence;
  filters: ReviewAnalyticsFilters;
  reviews: ReviewAnalyticsReview[];
  shows: ReviewAnalyticsShow[];
  workflow: ReviewAnalyticsReport["workflow"];
}): ReviewAnalyticsReport {
  const shows = new Map(input.shows.map((show) => [show.id, show]));
  const filteredShowIds = new Set(
    input.shows
      .filter((show) => input.filters.venue === "all" || show.venue === input.filters.venue)
      .filter((show) => !input.filters.performanceId || show.id === input.filters.performanceId)
      .filter((show) => inRange(show.date, input.filters.performanceFrom, input.filters.performanceTo))
      .map((show) => show.id),
  );
  const reviews = input.reviews
    .filter((review) => filteredShowIds.has(review.showId))
    .filter((review) =>
      inRange(
        getJohannesburgDateKey(review.submittedAt),
        input.filters.submittedFrom,
        input.filters.submittedTo,
      ),
    );
  const publicReviews = reviews.filter(
    (review) =>
      review.moderationStatus === "published" && review.publicationConsent,
  );
  const evidence = {
    attended: input.evidence.attended.filter((item) => filteredShowIds.has(item.showId)),
    invitations: input.evidence.invitations.filter((item) => filteredShowIds.has(item.showId)),
    sent: input.evidence.sent.filter((item) => filteredShowIds.has(item.showId)),
  };
  const reviewBookingIds = new Set(reviews.map((review) => review.bookingId));
  const sentBookingIds = new Set(evidence.sent.map((item) => item.bookingId));
  const submittedFromSentInvitations = [...reviewBookingIds].filter((bookingId) =>
    sentBookingIds.has(bookingId),
  ).length;
  const guestRating = average(reviews.map((review) => review.rating));
  const publicRating = average(publicReviews.map((review) => review.rating));
  const published = publicReviews.length;
  const moderation = {
    needsReview: reviews.filter((review) => review.moderationStatus === "needs_review").length,
    notPublished: reviews.filter((review) => review.moderationStatus === "not_published").length,
    published,
    unpublished: reviews.filter((review) => review.unpublishedAt).length,
  };
  const grain = trendGrain(input.filters);
  const trendGroups = new Map<string, ReviewAnalyticsReview[]>();
  for (const review of reviews) {
    const period = trendPeriod(review.submittedAt, grain);
    trendGroups.set(period, [...(trendGroups.get(period) ?? []), review]);
  }

  const venueComparison = (["johannesburg", "cape-town"] as const)
    .filter((venue) => input.filters.venue === "all" || input.filters.venue === venue)
    .map((venue) => {
      const venueReviews = reviews.filter((review) => review.venue === venue);
      const venuePublic = venueReviews.filter(
        (review) => review.moderationStatus === "published" && review.publicationConsent,
      );
      const venueShowIds = new Set(input.shows.filter((show) => show.venue === venue).map((show) => show.id));
      const venueSent = evidence.sent.filter((item) => venueShowIds.has(item.showId));
      const venueSentSet = new Set(venueSent.map((item) => item.bookingId));
      const venueResponses = new Set(
        venueReviews
          .filter((review) => venueSentSet.has(review.bookingId))
          .map((review) => review.bookingId),
      ).size;
      return {
        contactRequested: venueReviews.filter((review) => review.contactRequested).length,
        guestRating: average(venueReviews.map((review) => review.rating)),
        publicRating: average(venuePublic.map((review) => review.rating)),
        published: venuePublic.length,
        responseRate: rate(venueResponses, venueSentSet.size),
        reviewsReceived: venueReviews.length,
        venue,
      };
    });

  const performance = input.shows
    .filter((show) => filteredShowIds.has(show.id))
    .map((show) => {
      const showReviews = reviews.filter((review) => review.showId === show.id);
      const showSentSet = new Set(
        evidence.sent
          .filter((item) => item.showId === show.id)
          .map((item) => item.bookingId),
      );
      const responses = new Set(
        showReviews
          .filter((review) => showSentSet.has(review.bookingId))
          .map((review) => review.bookingId),
      ).size;
      return {
        contactRequested: showReviews.filter((review) => review.contactRequested).length,
        date: show.date,
        guestRating: average(showReviews.map((review) => review.rating)),
        id: show.id,
        name: show.name,
        responseRate: rate(responses, showSentSet.size),
        reviewsReceived: showReviews.length,
        time: show.time.slice(0, 5),
        venue: show.venue,
      };
    })
    .filter((show) => show.reviewsReceived > 0)
    .sort((left, right) => `${right.date}${right.time}`.localeCompare(`${left.date}${left.time}`));

  const sortedReviews = [...reviews].sort((left, right) =>
    right.submittedAt.localeCompare(left.submittedAt),
  );

  return {
    asOf: input.asOf,
    filters: input.filters,
    funnel: {
      attended: new Set(evidence.attended.map((item) => item.bookingId)).size,
      invitationCreated: new Set(evidence.invitations.map((item) => item.bookingId)).size,
      mailerAccepted: sentBookingIds.size,
      published,
      submitted: reviews.length,
    },
    kpis: {
      consentRate: rate(
        reviews.filter((review) => review.publicationConsent).length,
        reviews.length,
      ),
      contactRequested: reviews.filter((review) => review.contactRequested).length,
      featured: publicReviews.filter((review) => review.featured).length,
      guestRating,
      needsReview: moderation.needsReview,
      notPublished: moderation.notPublished,
      publicRating,
      publicationRate: rate(published, reviews.length),
      publishedReviews: published,
      responseRate: rate(submittedFromSentInvitations, sentBookingIds.size),
      reviewsReceived: reviews.length,
      unpublished: moderation.unpublished,
    },
    lowRatings: sortedReviews
      .filter((review) => review.rating <= 2)
      .slice(0, 8)
      .map((review) => feedbackRow(review, shows)),
    moderation,
    performance,
    publicDistribution: distribution(publicReviews),
    ratingDistribution: distribution(reviews),
    recentFeedback: sortedReviews
      .slice(0, 8)
      .map((review) => feedbackRow(review, shows)),
    trend: [...trendGroups.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([period, periodReviews]) => ({
        guestRating: average(periodReviews.map((review) => review.rating)),
        period,
        reviewsReceived: periodReviews.length,
      })),
    trendGrain: grain,
    venueComparison,
    workflow: input.workflow,
  };
}
