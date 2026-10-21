import {
  loadPlatformFeedbackCandidates,
  preparePlatformFeedbackCampaign,
  sendPlatformFeedbackCampaignBatch,
} from "@/lib/platformFeedbackCampaign";
import { platformFeedbackCampaignKey } from "@/lib/platformFeedback";
import { getRolePermissions, requireActiveStaff } from "@/lib/supabase/serverAdmin";

export const dynamic = "force-dynamic";

function roleOf(profile: NonNullable<Awaited<ReturnType<typeof requireActiveStaff>>["staffProfile"]>) {
  return Array.isArray(profile.roles) ? profile.roles[0] : profile.roles;
}

async function authorize(request: Request) {
  const auth = await requireActiveStaff(request);
  if (auth.error || !auth.serviceClient || !auth.staffProfile) return { error: auth.error };
  if (!getRolePermissions(roleOf(auth.staffProfile)).includes("settings:manage")) {
    return { error: Response.json({ error: "Management settings access is required." }, { status: 403 }) };
  }
  return { auth };
}

export async function GET(request: Request) {
  const result = await authorize(request);
  if ("error" in result) return result.error;
  const { auth } = result;
  try {
    const [{ data: campaign, error }, eligible] = await Promise.all([
      auth.serviceClient.from("platform_feedback_campaigns").select("id,status,approved_at,created_at,updated_at").eq("campaign_key", platformFeedbackCampaignKey).single(),
      loadPlatformFeedbackCandidates(auth.serviceClient),
    ]);
    if (error) throw error;
    const { count } = await auth.serviceClient.from("platform_feedback_invitations").select("id", { count: "exact", head: true }).eq("campaign_id", campaign.id);
    return Response.json({ campaign, eligible: eligible.length, invitations: count ?? 0 });
  } catch (error) {
    console.error("[Platform Feedback] Campaign status failed", error);
    return Response.json({ error: "Campaign status could not be loaded." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const result = await authorize(request);
  if ("error" in result) return result.error;
  const { auth } = result;
  try {
    const body = (await request.json()) as { action?: "prepare" | "send_batch" };
    if (body.action === "prepare") return Response.json(await preparePlatformFeedbackCampaign(auth.serviceClient));
    if (body.action === "send_batch") {
      const origin = process.env.NEXT_PUBLIC_APP_URL || "https://book.zingara.co.za";
      return Response.json(await sendPlatformFeedbackCampaignBatch(auth.serviceClient, origin));
    }
    return Response.json({ error: "Choose a valid campaign action." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "PLATFORM_FEEDBACK_CAMPAIGN_NOT_APPROVED") {
      return Response.json({ error: "The customer campaign is awaiting management approval." }, { status: 409 });
    }
    if (message === "PLATFORM_FEEDBACK_AUTOMATION_DISABLED") {
      return Response.json({ error: "Booking Experience Feedback is switched off under Staff Emails." }, { status: 409 });
    }
    console.error("[Platform Feedback] Campaign action failed", error);
    return Response.json({ error: "The campaign action could not be completed." }, { status: 500 });
  }
}
