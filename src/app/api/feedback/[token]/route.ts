import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit";
import { validatePlatformFeedbackSubmission } from "@/lib/platformFeedback";
import { hashPlatformFeedbackToken } from "@/lib/platformFeedbackTokenVault";
import { getServiceClient } from "@/lib/supabase/serverAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ token: string }> };

async function resolveContext(token: string) {
  const client = getServiceClient();
  if (!client) throw new Error("PLATFORM_FEEDBACK_UNAVAILABLE");
  const tokenHash = hashPlatformFeedbackToken(token);
  const { data: invitation, error } = await client
    .from("platform_feedback_invitations")
    .select("id,customer_id,venue,status,expires_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (error) throw error;
  if (!invitation || invitation.status === "revoked") throw new Error("PLATFORM_FEEDBACK_LINK_INVALID");
  if (invitation.status === "submitted") throw new Error("PLATFORM_FEEDBACK_ALREADY_SUBMITTED");
  if (invitation.status === "expired" || new Date(invitation.expires_at) <= new Date()) {
    await client.from("platform_feedback_invitations").update({ status: "expired", updated_at: new Date().toISOString() }).eq("id", invitation.id).neq("status", "submitted");
    throw new Error("PLATFORM_FEEDBACK_LINK_EXPIRED");
  }
  const { data: customer, error: customerError } = await client
    .from("customers")
    .select("first_name")
    .eq("id", invitation.customer_id)
    .maybeSingle();
  if (customerError) throw customerError;
  await client.from("platform_feedback_invitations").update({ last_accessed_at: new Date().toISOString() }).eq("id", invitation.id);
  return {
    client,
    feedback: {
      firstName: customer?.first_name?.trim() || "Zingarian",
      venue: invitation.venue,
    },
    tokenHash,
  };
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("ALREADY_SUBMITTED")) {
    return Response.json({ error: "Feedback has already been submitted for this invitation." }, { status: 409 });
  }
  if (message.includes("LINK_EXPIRED")) {
    return Response.json({ error: "This feedback link has expired." }, { status: 410 });
  }
  if (message.includes("LINK_INVALID")) {
    return Response.json({ error: "This feedback link is unavailable." }, { status: 404 });
  }
  console.error("[Platform Feedback] Request failed", {
    error: message || "Unknown platform-feedback failure",
  });
  return Response.json({ error: "Booking feedback is temporarily unavailable." }, { status: 503 });
}

export async function GET(request: Request, context: RouteContext) {
  const client = getServiceClient();
  if (!client) return Response.json({ error: "Booking feedback is temporarily unavailable." }, { status: 503 });
  const { token } = await context.params;
  const limit = await checkRateLimit(
    request,
    { limit: 60, scope: "platform_feedback_view", windowSeconds: 600 },
    [hashPlatformFeedbackToken(token).slice(0, 20)],
    client,
  );
  if (!limit.allowed) return rateLimitResponse(limit.retryAfterSeconds);
  try {
    const resolved = await resolveContext(token);
    return Response.json({ feedback: resolved.feedback });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  const client = getServiceClient();
  if (!client) return Response.json({ error: "Booking feedback is temporarily unavailable." }, { status: 503 });
  const { token } = await context.params;
  const limit = await checkRateLimit(
    request,
    { limit: 5, scope: "platform_feedback_submit", windowSeconds: 3600 },
    [hashPlatformFeedbackToken(token).slice(0, 20)],
    client,
  );
  if (!limit.allowed) return rateLimitResponse(limit.retryAfterSeconds);
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const validated = validatePlatformFeedbackSubmission(body);
    if ("error" in validated) return Response.json({ error: validated.error }, { status: 400 });
    const resolved = await resolveContext(token);
    const { data, error } = await resolved.client.rpc("submit_platform_feedback", {
      p_comment: validated.value.comment,
      p_contact_requested: validated.value.contactRequested,
      p_rating: validated.value.rating,
      p_token_hash: resolved.tokenHash,
    });
    if (error) throw error;
    return Response.json({ feedback: data }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
