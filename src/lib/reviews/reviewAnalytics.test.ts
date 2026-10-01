import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  calculateReviewAnalytics,
  hasPersistedReviewAttendance,
  type ReviewAnalyticsFilters,
  type ReviewAnalyticsReview,
  type ReviewAnalyticsShow,
} from "./reviewAnalytics.ts";

const filters: ReviewAnalyticsFilters = {
  performanceFrom: "",
  performanceId: "",
  performanceTo: "",
  submittedFrom: "",
  submittedTo: "",
  venue: "all",
};

const shows: ReviewAnalyticsShow[] = [
  { date: "2026-09-30", id: "show-jhb", name: "The Royal Countess", time: "17:00:00", venue: "johannesburg" },
  { date: "2026-10-01", id: "show-cpt", name: "The Royal Countess", time: "18:00:00", venue: "cape-town" },
];

function review(overrides: Partial<ReviewAnalyticsReview> = {}): ReviewAnalyticsReview {
  return {
    bookingId: "booking-one",
    contactRequested: false,
    displayName: "Verified Guest",
    featured: false,
    id: "review-one",
    moderationStatus: "needs_review",
    publicationConsent: false,
    rating: 1,
    reviewText: "The guest supplied useful feedback about the experience.",
    showId: "show-jhb",
    submittedAt: "2026-10-01T00:30:00+02:00",
    unpublishedAt: null,
    venue: "johannesburg",
    ...overrides,
  };
}

function calculate(
  reviews: ReviewAnalyticsReview[],
  filterOverrides: Partial<ReviewAnalyticsFilters> = {},
) {
  return calculateReviewAnalytics({
    asOf: "2026-10-01T12:00:00+02:00",
    evidence: {
      attended: [
        { bookingId: "booking-one", showId: "show-jhb" },
        { bookingId: "booking-two", showId: "show-cpt" },
      ],
      invitations: [
        { bookingId: "booking-one", showId: "show-jhb" },
        { bookingId: "booking-two", showId: "show-cpt" },
      ],
      sent: [
        { bookingId: "booking-one", showId: "show-jhb" },
        { bookingId: "booking-two", showId: "show-cpt" },
      ],
    },
    filters: { ...filters, ...filterOverrides },
    reviews,
    shows,
    workflow: { activatedAt: null, enabled: false, timingOffsetDays: 1 },
  });
}

test("zero data uses unavailable ratings and rates while preserving workflow-off state", () => {
  const result = calculate([]);
  assert.equal(result.kpis.guestRating, null);
  assert.equal(result.kpis.publicRating, null);
  assert.equal(result.kpis.reviewsReceived, 0);
  assert.equal(result.kpis.responseRate, 0);
  assert.equal(result.workflow.enabled, false);

  const noInvitations = calculateReviewAnalytics({
    asOf: "2026-10-01T12:00:00+02:00",
    evidence: { attended: [], invitations: [], sent: [] },
    filters,
    reviews: [],
    shows,
    workflow: { activatedAt: null, enabled: false, timingOffsetDays: 1 },
  });
  assert.equal(noInvitations.kpis.responseRate, null);
});

test("Guest Rating includes every submitted moderation outcome while Public Rating is published and consented only", () => {
  const result = calculate([
    review(),
    review({ bookingId: "booking-two", id: "review-two", moderationStatus: "not_published", rating: 2 }),
    review({ bookingId: "booking-three", featured: true, id: "review-three", moderationStatus: "published", publicationConsent: true, rating: 5 }),
    review({ bookingId: "booking-four", id: "review-four", moderationStatus: "published", publicationConsent: false, rating: 4 }),
  ]);

  assert.equal(result.kpis.guestRating, 3);
  assert.equal(result.kpis.publicRating, 5);
  assert.equal(result.kpis.publishedReviews, 1);
  assert.equal(result.kpis.featured, 1);
  assert.equal(result.moderation.notPublished, 1);
  assert.deepEqual(result.ratingDistribution.map((row) => row.count), [1, 1, 0, 1, 1]);
  assert.deepEqual(result.publicDistribution.map((row) => row.count), [1, 0, 0, 0, 0]);
});

test("response, publication, consent and contact metrics use explicit denominators", () => {
  const result = calculate([
    review({ contactRequested: true, moderationStatus: "published", publicationConsent: true, rating: 5 }),
  ]);
  assert.equal(result.kpis.responseRate, 0.5);
  assert.equal(result.kpis.publicationRate, 1);
  assert.equal(result.kpis.consentRate, 1);
  assert.equal(result.kpis.contactRequested, 1);
  assert.equal(result.funnel.attended, 2);
  assert.equal(result.funnel.invitationCreated, 2);
  assert.equal(result.funnel.mailerAccepted, 2);
});

test("venue and show filters scope reviews plus attendance and invitation evidence", () => {
  const rows = [
    review(),
    review({ bookingId: "booking-two", id: "review-two", rating: 5, showId: "show-cpt", venue: "cape-town" }),
  ];
  const jhb = calculate(rows, { venue: "johannesburg" });
  assert.equal(jhb.kpis.reviewsReceived, 1);
  assert.equal(jhb.funnel.attended, 1);
  assert.equal(jhb.funnel.mailerAccepted, 1);
  assert.deepEqual(jhb.venueComparison.map((row) => row.venue), ["johannesburg"]);

  const cptShow = calculate(rows, { performanceId: "show-cpt" });
  assert.equal(cptShow.kpis.guestRating, 5);
  assert.deepEqual(cptShow.performance.map((row) => row.id), ["show-cpt"]);
  assert.equal(cptShow.funnel.invitationCreated, 1);
});

test("submitted dates use SAST while performance dates remain a separate filter", () => {
  const midnight = review({ submittedAt: "2026-09-30T22:30:00Z" });
  assert.equal(calculate([midnight], { submittedFrom: "2026-10-01", submittedTo: "2026-10-01" }).kpis.reviewsReceived, 1);
  assert.equal(calculate([midnight], { submittedFrom: "2026-09-30", submittedTo: "2026-09-30" }).kpis.reviewsReceived, 0);
  assert.equal(calculate([midnight], { performanceFrom: "2026-10-01" }).kpis.reviewsReceived, 0);
});

test("low-rating and recent feedback are bounded previews and moderation remains separate", () => {
  const rows = Array.from({ length: 12 }, (_, index) =>
    review({
      bookingId: `booking-${index}`,
      contactRequested: index === 0,
      id: `review-${index}`,
      rating: index < 10 ? 2 : 5,
      reviewText: "x".repeat(250),
      submittedAt: `2026-10-01T${String(index).padStart(2, "0")}:00:00+02:00`,
    }),
  );
  const result = calculate(rows);
  assert.equal(result.lowRatings.length, 8);
  assert.equal(result.recentFeedback.length, 8);
  assert.equal(result.recentFeedback.every((row) => row.preview.length <= 180), true);
});

test("attendance helper accepts the workflow and database ticket shapes", () => {
  assert.equal(hasPersistedReviewAttendance("booking-one", [{ bookingId: "booking-one", ticketStatus: "checked_in" }]), true);
  assert.equal(hasPersistedReviewAttendance("booking-one", [{ booking_id: "booking-one", ticket_status: "checked_in" }]), true);
  assert.equal(hasPersistedReviewAttendance("booking-one", [{ booking_id: "booking-one", ticket_status: "active" }]), false);
});

test("protected analytics stays lazy, scoped and free of token or payment fields", async () => {
  const root = process.cwd();
  const route = await readFile(`${root}/src/app/api/admin/analytics/reviews/route.ts`, "utf8");
  const server = await readFile(`${root}/src/lib/supabase/reviewAnalyticsServer.ts`, "utf8");
  const panel = await readFile(`${root}/src/app/admin/ReviewAnalyticsPanel.tsx`, "utf8");
  const management = await readFile(`${root}/src/app/admin/ManagementAnalytics.tsx`, "utf8");

  assert.match(route, /requireActiveStaff\(request\)/);
  assert.match(route, /analytics:read/);
  assert.match(server, /normalizeStaffVenueScope/);
  assert.match(server, /Promise\.all/);
  assert.doesNotMatch(server, /token_hash|token_encrypted|customer_email|mobile|amount_paid|total_amount|balance_outstanding/);
  assert.match(panel, /does not claim email opens, clicks or inbox delivery/i);
  assert.match(management, /AnalyticsSection[\s\S]*guest-reviews/);
  assert.doesNotMatch(management, /openSections[^;]*guest-reviews/);
});
