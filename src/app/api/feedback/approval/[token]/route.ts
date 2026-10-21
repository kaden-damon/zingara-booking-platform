import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit";
import { hashPlatformFeedbackToken } from "@/lib/platformFeedbackTokenVault";
import { getServiceClient } from "@/lib/supabase/serverAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ token: string }> };

export async function GET(request: Request, context: RouteContext) {
  const client = getServiceClient();
  if (!client) return Response.json({ error: "The approval journey is temporarily unavailable." }, { status: 503 });
  const { token } = await context.params;
  const tokenHash = hashPlatformFeedbackToken(token);
  const limit = await checkRateLimit(
    request,
    { limit: 60, scope: "platform_feedback_approval_view", windowSeconds: 600 },
    [tokenHash.slice(0, 20)],
    client,
  );
  if (!limit.allowed) return rateLimitResponse(limit.retryAfterSeconds);
  const { data: link, error } = await client
    .from("platform_feedback_approval_links")
    .select("id,staff_profile_id,expires_at,campaign_id")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (error) {
    console.error("[Platform Feedback] Approval link lookup failed", error);
    return Response.json({ error: "The approval journey is temporarily unavailable." }, { status: 503 });
  }
  if (!link || new Date(link.expires_at) <= new Date()) {
    return Response.json({ error: "This approval link is unavailable or has expired." }, { status: 410 });
  }
  const [{ data: staff }, { data: campaign }] = await Promise.all([
    client.from("staff_profiles").select("full_name").eq("id", link.staff_profile_id).maybeSingle(),
    client.from("platform_feedback_campaigns").select("status").eq("id", link.campaign_id).maybeSingle(),
  ]);
  if (!staff || !campaign || campaign.status !== "awaiting_approval") {
    return Response.json({ error: "This approval journey is no longer active." }, { status: 410 });
  }
  await client.from("platform_feedback_approval_links").update({ last_accessed_at: new Date().toISOString() }).eq("id", link.id);
  return Response.json({
    feedback: {
      firstName: staff.full_name?.trim().split(/\s+/)[0] || "Zingarian",
      venue: "cape-town",
    },
  });
}
