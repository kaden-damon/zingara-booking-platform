import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildVerifiedReviewUrl,
  createReviewToken,
  getReviewEligibilityReason,
  getSafePublicDisplayName,
  getSafePublicDisplayNameFromFullName,
  hashReviewToken,
  reviewInvitationLifetimeDays,
} from "@/lib/reviews/reviews";
import { openReviewToken, sealReviewToken } from "@/lib/reviews/reviewTokenVault";

type BookingRow = {
  archived_at: string | null;
  booking_reference: string;
  booking_status: string;
  customer_id: string;
  id: string;
  payment_status: string;
  show_id: string;
};

type CustomerRow = {
  first_name: string | null;
  id: string;
  surname: string | null;
};

type ShowRow = {
  date: string;
  id: string;
  name: string;
  time: string;
  venue: string;
};

type InvitationRow = {
  booking_id: string;
  expires_at: string;
  id: string;
  invitation_type: "automated_verified" | "manual_email" | "manual_link";
  recipient_name: string;
  status: string;
  token_envelope: unknown;
};

export class ReviewLinkError extends Error {
  constructor(
    public readonly code:
      | "already_submitted"
      | "expired"
      | "invalid"
      | "not_eligible"
      | "unavailable",
    message: string,
  ) {
    super(message);
  }
}

export function getReviewApplicationOrigin() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "https://book.zingara.co.za"
  ).replace(/\/$/, "");
}

async function loadReviewEvidence(supabase: SupabaseClient, bookingId: string) {
  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select(
      "id,booking_reference,booking_status,payment_status,archived_at,customer_id,show_id",
    )
    .eq("id", bookingId)
    .maybeSingle();

  if (bookingError) throw bookingError;
  if (!booking) throw new ReviewLinkError("not_eligible", "This booking is not eligible for a review.");

  const typedBooking = booking as BookingRow;
  const [{ data: customer, error: customerError }, { data: show, error: showError }, { data: tickets, error: ticketError }] =
    await Promise.all([
      supabase
        .from("customers")
        .select("id,first_name,surname")
        .eq("id", typedBooking.customer_id)
        .maybeSingle(),
      supabase
        .from("shows")
        .select("id,name,date,time,venue")
        .eq("id", typedBooking.show_id)
        .maybeSingle(),
      supabase
        .from("tickets")
        .select("ticket_status")
        .eq("booking_id", typedBooking.id),
    ]);

  if (customerError) throw customerError;
  if (showError) throw showError;
  if (ticketError) throw ticketError;
  if (!customer || !show) {
    throw new ReviewLinkError("not_eligible", "This booking is not eligible for a review.");
  }

  return {
    booking: typedBooking,
    checkedIn: (tickets ?? []).some((ticket) => ticket.ticket_status === "checked_in"),
    customer: customer as CustomerRow,
    show: show as ShowRow,
  };
}

export async function getOrCreateVerifiedReviewLink(
  supabase: SupabaseClient,
  bookingId: string,
  options: { now?: Date; origin?: string } = {},
) {
  const now = options.now ?? new Date();
  const evidence = await loadReviewEvidence(supabase, bookingId);
  const exclusion = getReviewEligibilityReason(
    {
      archivedAt: evidence.booking.archived_at,
      bookingReference: evidence.booking.booking_reference,
      bookingStatus: evidence.booking.booking_status,
      checkedIn: evidence.checkedIn,
      paymentStatus: evidence.booking.payment_status,
      showDate: evidence.show.date,
      showTime: evidence.show.time,
    },
    now,
  );

  if (exclusion) {
    throw new ReviewLinkError("not_eligible", "This booking is not eligible for a review.");
  }

  const { data: existing, error: invitationError } = await supabase
    .from("review_invitations")
    .select("id,booking_id,status,expires_at,token_envelope,invitation_type,recipient_name")
    .eq("booking_id", bookingId)
    .eq("invitation_type", "automated_verified")
    .maybeSingle();

  if (invitationError) throw invitationError;

  const invitation = existing as InvitationRow | null;
  if (invitation && invitation.status !== "revoked") {
    const token = openReviewToken(invitation.token_envelope);
    if (token && new Date(invitation.expires_at) > now) {
      return {
        expiresAt: invitation.expires_at,
        invitationId: invitation.id,
        reused: true,
        url: buildVerifiedReviewUrl(options.origin ?? getReviewApplicationOrigin(), token),
      };
    }
  }

  const token = createReviewToken();
  const expiresAt = new Date(
    now.getTime() + reviewInvitationLifetimeDays * 24 * 60 * 60 * 1000,
  ).toISOString();
  const values = {
    booking_id: evidence.booking.id,
    customer_id: evidence.customer.id,
    expires_at: expiresAt,
    revoked_at: null,
    show_id: evidence.show.id,
    invitation_type: "automated_verified",
    recipient_email: null,
    normalized_email: null,
    recipient_name:
      [evidence.customer.first_name, evidence.customer.surname]
        .filter(Boolean)
        .join(" ")
        .trim() || "Zingara Guest",
    status: "active",
    submitted_at: null,
    token_envelope: sealReviewToken(token),
    token_hash: hashReviewToken(token),
    updated_at: now.toISOString(),
  };

  const query = invitation
    ? supabase.from("review_invitations").update(values).eq("id", invitation.id)
    : supabase.from("review_invitations").insert(values);
  const { data: saved, error: saveError } = await query
    .select("id,expires_at")
    .single();

  if (saveError) {
    if (!invitation && saveError.code === "23505") {
      const { data: racedInvitation, error: raceError } = await supabase
        .from("review_invitations")
        .select("id,expires_at,token_envelope")
        .eq("booking_id", bookingId)
        .eq("invitation_type", "automated_verified")
        .single();
      if (raceError) throw raceError;
      const racedToken = openReviewToken(racedInvitation.token_envelope);
      if (!racedToken) throw new ReviewLinkError("unavailable", "The verified review link is unavailable.");
      return {
        expiresAt: racedInvitation.expires_at as string,
        invitationId: racedInvitation.id as string,
        reused: true,
        url: buildVerifiedReviewUrl(
          options.origin ?? getReviewApplicationOrigin(),
          racedToken,
        ),
      };
    }
    throw saveError;
  }

  return {
    expiresAt: saved.expires_at as string,
    invitationId: saved.id as string,
    reused: false,
    url: buildVerifiedReviewUrl(options.origin ?? getReviewApplicationOrigin(), token),
  };
}

export async function resolveVerifiedReviewContext(
  supabase: SupabaseClient,
  token: string,
  now = new Date(),
) {
  if (!/^[A-Za-z0-9_-]{40,100}$/.test(token)) {
    throw new ReviewLinkError("invalid", "This review link is invalid.");
  }

  const { data: invitation, error } = await supabase
    .from("review_invitations")
    .select("id,booking_id,status,expires_at,submitted_at,invitation_type,recipient_name")
    .eq("token_hash", hashReviewToken(token))
    .maybeSingle();

  if (error) throw error;
  if (!invitation || invitation.status === "revoked") {
    throw new ReviewLinkError("invalid", "This review link is invalid.");
  }
  if (invitation.status === "submitted") {
    throw new ReviewLinkError("already_submitted", "A review has already been submitted for this booking.");
  }
  if (invitation.status === "expired" || new Date(invitation.expires_at) <= now) {
    throw new ReviewLinkError("expired", "This review link has expired.");
  }

  const evidence = await loadReviewEvidence(supabase, invitation.booking_id);
  const isVerified = invitation.invitation_type === "automated_verified";
  const exclusion = getReviewEligibilityReason(
    {
      archivedAt: evidence.booking.archived_at,
      bookingReference: evidence.booking.booking_reference,
      bookingStatus: evidence.booking.booking_status,
      checkedIn: isVerified ? evidence.checkedIn : true,
      paymentStatus: evidence.booking.payment_status,
      showDate: evidence.show.date,
      showTime: evidence.show.time,
    },
    now,
  );

  if (exclusion) {
    throw new ReviewLinkError("not_eligible", "This booking is not eligible for a review.");
  }

  return {
    expiresAt: invitation.expires_at as string,
    firstName: isVerified
      ? evidence.customer.first_name?.trim() || "Guest"
      : invitation.recipient_name.trim().split(/\s+/)[0] || "Guest",
    guestType: isVerified ? "verified" : "invited",
    publicDisplayName: isVerified
      ? getSafePublicDisplayName({
          firstName: evidence.customer.first_name,
          surname: evidence.customer.surname,
        })
      : getSafePublicDisplayNameFromFullName(invitation.recipient_name),
    performanceDate: evidence.show.date,
    performanceName: evidence.show.name,
    performanceTime: evidence.show.time.slice(0, 5),
    venue: evidence.show.venue,
  };
}

export function getReviewLinkErrorResponse(error: unknown) {
  if (error instanceof ReviewLinkError) {
    const status = error.code === "invalid" ? 404 : error.code === "unavailable" ? 503 : 410;
    return { body: { code: error.code, error: error.message }, status };
  }

  console.error("[Guest Reviews] Review request failed", error);
  return {
    body: { code: "unavailable", error: "Reviews are temporarily unavailable. Please try again later." },
    status: 503,
  };
}
