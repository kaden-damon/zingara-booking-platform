import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit";
import { hashReviewToken } from "@/lib/reviews/reviews";
import { getServiceClient } from "@/lib/supabase/serverAdmin";

export const dynamic = "force-dynamic";

function tokenIsValid(token: string) {
  return /^[A-Za-z0-9_-]{40,100}$/.test(token);
}

export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const supabase = getServiceClient();
  if (!supabase) return Response.json({ error: "This request is temporarily unavailable." }, { status: 503 });
  if (!tokenIsValid(token)) return Response.json({ error: "This permission link is invalid." }, { status: 404 });

  const limit = await checkRateLimit(
    request,
    { limit: 30, scope: "review_anonymous_permission_view", windowSeconds: 600 },
    [hashReviewToken(token).slice(0, 20)],
    supabase,
  );
  if (!limit.allowed) return rateLimitResponse(limit.retryAfterSeconds);

  const { data, error } = await supabase
    .from("review_anonymous_permission_requests")
    .select("status,expires_at,guest_reviews!inner(publication_consent_mode)")
    .eq("token_hash", hashReviewToken(token))
    .maybeSingle();
  if (error) throw error;
  if (!data) return Response.json({ error: "This permission link is invalid." }, { status: 404 });
  if (data.status === "expired" || (data.status === "pending" && new Date(data.expires_at) <= new Date())) {
    return Response.json({ error: "This permission link has expired." }, { status: 410 });
  }
  return Response.json({ status: data.status });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const supabase = getServiceClient();
  if (!supabase) return Response.json({ error: "This request is temporarily unavailable." }, { status: 503 });
  if (!tokenIsValid(token)) return Response.json({ error: "This permission link is invalid." }, { status: 404 });

  const limit = await checkRateLimit(
    request,
    { limit: 5, scope: "review_anonymous_permission_response", windowSeconds: 3600 },
    [hashReviewToken(token).slice(0, 20)],
    supabase,
  );
  if (!limit.allowed) return rateLimitResponse(limit.retryAfterSeconds);

  try {
    const body = (await request.json()) as { granted?: unknown };
    if (typeof body.granted !== "boolean") {
      return Response.json({ error: "Choose yes or no." }, { status: 400 });
    }
    const { data, error } = await supabase.rpc("respond_to_review_anonymous_permission", {
      p_granted: body.granted,
      p_token_hash: hashReviewToken(token),
    });
    if (error) throw error;
    return Response.json({ response: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("REVIEW_PERMISSION_LINK_EXPIRED")) {
      return Response.json({ error: "This permission link has expired." }, { status: 410 });
    }
    if (message.includes("REVIEW_PERMISSION_NOT_AVAILABLE")) {
      return Response.json({ error: "This review no longer needs a permission choice." }, { status: 409 });
    }
    console.error("[Guest Reviews] Anonymous permission response failed", error);
    return Response.json({ error: "Your choice could not be saved. Try again." }, { status: 500 });
  }
}
