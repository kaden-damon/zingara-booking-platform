import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit";
import {
  getReviewLinkErrorResponse,
  resolveVerifiedReviewContext,
} from "@/lib/reviews/reviewServer";
import { hashReviewToken, validateReviewSubmission } from "@/lib/reviews/reviews";
import { getServiceClient } from "@/lib/supabase/serverAdmin";
import { sendImmediateReviewAlert } from "@/lib/workflows/reviewManagement";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ token: string }> };

export async function GET(request: Request, context: RouteContext) {
  const supabase = getServiceClient();
  if (!supabase) {
    return Response.json({ error: "Reviews are temporarily unavailable." }, { status: 503 });
  }

  const { token } = await context.params;
  const limit = await checkRateLimit(
    request,
    { limit: 60, scope: "verified_review_view", windowSeconds: 600 },
    [hashReviewToken(token).slice(0, 20)],
    supabase,
  );
  if (!limit.allowed) return rateLimitResponse(limit.retryAfterSeconds);

  try {
    const review = await resolveVerifiedReviewContext(supabase, token);
    return Response.json({ review });
  } catch (error) {
    const response = getReviewLinkErrorResponse(error);
    return Response.json(response.body, { status: response.status });
  }
}

export async function POST(request: Request, context: RouteContext) {
  const supabase = getServiceClient();
  if (!supabase) {
    return Response.json({ error: "Reviews are temporarily unavailable." }, { status: 503 });
  }

  const { token } = await context.params;
  const limit = await checkRateLimit(
    request,
    { limit: 5, scope: "verified_review_submit", windowSeconds: 3600 },
    [hashReviewToken(token).slice(0, 20)],
    supabase,
  );
  if (!limit.allowed) return rateLimitResponse(limit.retryAfterSeconds);

  try {
    await resolveVerifiedReviewContext(supabase, token);
    const body = (await request.json()) as Record<string, unknown>;
    const validated = validateReviewSubmission({
      contactRequested: body.contactRequested,
      publicationConsent: body.publicationConsent,
      rating: body.rating,
      reviewText: body.reviewText,
    });

    if ("error" in validated) {
      return Response.json({ error: validated.error }, { status: 400 });
    }

    const { data, error } = await supabase.rpc("submit_verified_guest_review", {
      p_contact_requested: validated.value.contactRequested,
      p_publication_consent: validated.value.publicationConsent,
      p_rating: validated.value.rating,
      p_review_text: validated.value.reviewText,
      p_token_hash: hashReviewToken(token),
    });

    if (error) throw error;
    const submitted = data as { id?: string; idempotent?: boolean } | null;
    if (submitted?.id && !submitted.idempotent) {
      try {
        await sendImmediateReviewAlert(supabase, submitted.id);
      } catch (notificationError) {
        console.error("[Reviews] Management alert failed after review persisted", {
          error: notificationError instanceof Error ? notificationError.message : "Unknown alert failure",
          reviewId: submitted.id,
        });
      }
    }
    return Response.json({ review: data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("REVIEW_ALREADY_SUBMITTED")) {
      return Response.json(
        { code: "already_submitted", error: "A review has already been submitted for this booking." },
        { status: 409 },
      );
    }
    if (message.includes("REVIEW_LINK_EXPIRED")) {
      return Response.json({ code: "expired", error: "This review link has expired." }, { status: 410 });
    }
    if (message.includes("REVIEW_NOT_ELIGIBLE")) {
      return Response.json(
        { code: "not_eligible", error: "This booking is not eligible for a review." },
        { status: 410 },
      );
    }

    const response = getReviewLinkErrorResponse(error);
    return Response.json(response.body, { status: response.status });
  }
}
