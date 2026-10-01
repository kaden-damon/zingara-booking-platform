import type { SupabaseClient } from "@supabase/supabase-js";
import { getJohannesburgDateKey, type AnalyticsVenue } from "@/lib/managementAnalytics";
import {
  calculateReviewAnalytics,
  hasPersistedReviewAttendance,
  type ReviewAnalyticsFilters,
  type ReviewAnalyticsReport,
  type ReviewAnalyticsReview,
  type ReviewAnalyticsShow,
} from "@/lib/reviews/reviewAnalytics";
import { getReviewEligibilityReason } from "@/lib/reviews/reviews";
import { normalizeStaffVenueScope } from "@/lib/staffLocations";
import { loadWorkflowConfigurations } from "@/lib/workflows/automatedWorkflows";
import { normalizeShowLocation } from "@/lib/zingaraDemo";

const pageSize = 1000;

async function loadAllRows<Row>(
  loadPage: (from: number, to: number) => PromiseLike<{
    data: unknown[] | null;
    error: { message?: string } | null;
  }>,
) {
  const rows: Row[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await loadPage(from, from + pageSize - 1);
    if (error) throw error;
    const page = (data ?? []) as Row[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

type ShowRow = {
  date: string;
  id: string;
  name: string;
  time: string;
  venue: string;
};

type ReviewRow = {
  booking_id: string;
  contact_requested: boolean;
  featured: boolean;
  id: string;
  moderation_status: "needs_review" | "not_published" | "published";
  public_display_name: string;
  publication_consent: boolean;
  rating: number;
  show_id: string;
  submitted_at: string;
  unpublished_at: string | null;
  venue: AnalyticsVenue;
};

type BookingRow = {
  archived_at: string | null;
  booking_reference: string;
  booking_status: string;
  id: string;
  payment_status: string;
  show_id: string;
};

type TicketRow = {
  booking_id: string;
  ticket_status: string;
};

function permittedVenues(scope: string[]) {
  const normalized = normalizeStaffVenueScope(scope ?? []);
  if (normalized.includes("all")) {
    return new Set<AnalyticsVenue>(["cape-town", "johannesburg"]);
  }
  return new Set(
    normalized.filter(
      (venue): venue is AnalyticsVenue =>
        venue === "cape-town" || venue === "johannesburg",
    ),
  );
}

function inRange(value: string, from: string, to: string) {
  return (!from || value >= from) && (!to || value <= to);
}

export async function loadReviewAnalyticsReport(
  serviceClient: SupabaseClient,
  venueScope: string[],
  filters: ReviewAnalyticsFilters,
  now = new Date(),
): Promise<ReviewAnalyticsReport> {
  const venues = permittedVenues(venueScope);
  const [showRows, workflows] = await Promise.all([
    loadAllRows<ShowRow>((from, to) =>
      serviceClient
        .from("shows")
        .select("id,name,date,time,venue")
        .order("id")
        .range(from, to),
    ),
    loadWorkflowConfigurations(serviceClient),
  ]);
  const shows = showRows
    .map((show): ReviewAnalyticsShow | null => {
      const venue = normalizeShowLocation(show.venue);
      if (!venue || !venues.has(venue)) return null;
      return { ...show, venue };
    })
    .filter((show): show is ReviewAnalyticsShow => Boolean(show))
    .filter((show) => filters.venue === "all" || show.venue === filters.venue)
    .filter((show) => !filters.performanceId || show.id === filters.performanceId)
    .filter((show) => inRange(show.date, filters.performanceFrom, filters.performanceTo));
  const showIds = shows.map((show) => show.id);
  const showMap = new Map(shows.map((show) => [show.id, show]));
  const reviewWorkflow = workflows.find(
    (workflow) => workflow.workflowKey === "post_show_review",
  );

  if (showIds.length === 0) {
    return calculateReviewAnalytics({
      asOf: now.toISOString(),
      evidence: { attended: [], invitations: [], sent: [] },
      filters,
      reviews: [],
      shows: [],
      workflow: {
        activatedAt: reviewWorkflow?.activatedAt ?? null,
        enabled: reviewWorkflow?.enabled ?? false,
        timingOffsetDays: reviewWorkflow?.timingOffsetDays ?? 1,
      },
    });
  }

  const [
    reviewRows,
    invitationRows,
    communicationRows,
    bookingRows,
  ] = await Promise.all([
    loadAllRows<ReviewRow>((from, to) =>
      serviceClient
        .from("guest_reviews")
        .select(
          "id,booking_id,show_id,venue,public_display_name,rating,contact_requested,publication_consent,moderation_status,submitted_at,unpublished_at,featured",
        )
        .in("show_id", showIds)
        .order("submitted_at", { ascending: false })
        .range(from, to),
    ),
    loadAllRows<{ booking_id: string; created_at: string; show_id: string }>((from, to) =>
      serviceClient
        .from("review_invitations")
        .select("booking_id,show_id,created_at")
        .in("show_id", showIds)
        .order("created_at")
        .range(from, to),
    ),
    loadAllRows<{
      booking_id: string | null;
      created_at: string;
      sent_at: string | null;
      show_id: string | null;
    }>((from, to) =>
      serviceClient
        .from("communications")
        .select("booking_id,show_id,sent_at,created_at")
        .eq("type", "post_show_review")
        .eq("status", "sent")
        .in("show_id", showIds)
        .order("created_at")
        .range(from, to),
    ),
    loadAllRows<BookingRow>((from, to) =>
      serviceClient
        .from("bookings")
        .select(
          "id,show_id,booking_reference,booking_status,payment_status,archived_at",
        )
        .in("show_id", showIds)
        .order("id")
        .range(from, to),
    ),
  ]);

  const bookingIds = bookingRows.map((booking) => booking.id);
  const submittedReviewRows = reviewRows
    .filter((review) =>
      inRange(
        getJohannesburgDateKey(review.submitted_at),
        filters.submittedFrom,
        filters.submittedTo,
      ),
    )
    .sort((left, right) => right.submitted_at.localeCompare(left.submitted_at));
  const previewIds = [
    ...new Set([
      ...submittedReviewRows.slice(0, 8).map((review) => review.id),
      ...submittedReviewRows
        .filter((review) => review.rating <= 2)
        .slice(0, 8)
        .map((review) => review.id),
    ]),
  ];
  const [ticketRows, reviewTextRows] = await Promise.all([
    bookingIds.length
      ? loadAllRows<TicketRow>((from, to) =>
          serviceClient
            .from("tickets")
            .select("booking_id,ticket_status")
            .in("booking_id", bookingIds)
            .eq("ticket_status", "checked_in")
            .order("booking_id")
            .range(from, to),
        )
      : Promise.resolve([]),
    previewIds.length
      ? serviceClient
          .from("guest_reviews")
          .select("id,review_text")
          .in("id", previewIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (reviewTextRows.error) throw reviewTextRows.error;
  const reviewText = new Map(
    (reviewTextRows.data ?? []).map((row) => [
      row.id as string,
      row.review_text as string,
    ]),
  );
  const reviews: ReviewAnalyticsReview[] = reviewRows.map((review) => ({
    bookingId: review.booking_id,
    contactRequested: review.contact_requested,
    displayName: review.public_display_name,
    featured: review.featured,
    id: review.id,
    moderationStatus: review.moderation_status,
    publicationConsent: review.publication_consent,
    rating: review.rating,
    reviewText: reviewText.get(review.id) ?? "",
    showId: review.show_id,
    submittedAt: review.submitted_at,
    unpublishedAt: review.unpublished_at,
    venue: review.venue,
  }));
  const submittedRange = (timestamp: string) =>
    inRange(
      getJohannesburgDateKey(timestamp),
      filters.submittedFrom,
      filters.submittedTo,
    );
  const attended = bookingRows.flatMap((booking) => {
    const show = showMap.get(booking.show_id);
    if (!show || !hasPersistedReviewAttendance(booking.id, ticketRows)) return [];
    const reason = getReviewEligibilityReason(
      {
        archivedAt: booking.archived_at,
        bookingReference: booking.booking_reference,
        bookingStatus: booking.booking_status,
        checkedIn: true,
        paymentStatus: booking.payment_status,
        showDate: show.date,
        showTime: show.time,
      },
      now,
    );
    return reason ? [] : [{ bookingId: booking.id, showId: booking.show_id }];
  });

  return calculateReviewAnalytics({
    asOf: now.toISOString(),
    evidence: {
      attended,
      invitations: invitationRows
        .filter((row) => submittedRange(row.created_at))
        .map((row) => ({ bookingId: row.booking_id, showId: row.show_id })),
      sent: communicationRows.flatMap((row) => {
        const timestamp = row.sent_at ?? row.created_at;
        return row.booking_id && row.show_id && submittedRange(timestamp)
          ? [{ bookingId: row.booking_id, showId: row.show_id }]
          : [];
      }),
    },
    filters,
    reviews,
    shows,
    workflow: {
      activatedAt: reviewWorkflow?.activatedAt ?? null,
      enabled: reviewWorkflow?.enabled ?? false,
      timingOffsetDays: reviewWorkflow?.timingOffsetDays ?? 1,
    },
  });
}
