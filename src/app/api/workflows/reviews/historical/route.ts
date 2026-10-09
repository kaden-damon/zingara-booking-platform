import { getServiceClient } from "@/lib/supabase/serverAdmin";
import {
  historicalReviewApprovedMaximum,
  historicalReviewBatchSize,
  planHistoricalReviewInvitations,
  startHistoricalReviewInvitations,
} from "@/lib/workflows/historicalReviewInvitations";
import { isAuthorisedWorkflowCronRequest } from "@/lib/workflows/cronAuthorization";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

async function planHistoricalInvitations(now = new Date()) {
  const serviceClient = getServiceClient();
  if (!serviceClient) throw new Error("Supabase service role is not configured.");
  return { serviceClient, summary: await planHistoricalReviewInvitations(serviceClient, now) };
}

export async function GET(request: Request) {
  if (!isAuthorisedWorkflowCronRequest(request)) {
    return Response.json({ error: "Unauthorised workflow runner." }, { status: 401 });
  }
  try {
    const { summary } = await planHistoricalInvitations();
    return Response.json({
      approvedMaximum: historicalReviewApprovedMaximum,
      canDispatch: summary.eligible <= historicalReviewApprovedMaximum,
      periodStart: "2026-09-01",
      summary,
      workflow: "historical_post_show_review",
    });
  } catch (error) {
    console.error("[Review Invitations] Historical plan failed", error);
    return Response.json({ error: "Historical review invitations could not be planned." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isAuthorisedWorkflowCronRequest(request)) {
    return Response.json({ error: "Unauthorised workflow runner." }, { status: 401 });
  }
  const now = new Date();
  try {
    const serviceClient = getServiceClient();
    if (!serviceClient) throw new Error("Supabase service role is not configured.");
    const result = await startHistoricalReviewInvitations(serviceClient, now);
    if (result?.blocked) {
      return Response.json(
        {
          error: `Historical send blocked: ${result.plan.eligible} eligible bookings exceed the approved maximum of ${historicalReviewApprovedMaximum}.`,
          runId: result.runId,
          summary: result.plan,
        },
        { status: 409 },
      );
    }
    return Response.json({
      batchSize: historicalReviewBatchSize,
      ...result,
      workflow: "historical_post_show_review",
    });
  } catch (error) {
    console.error("[Review Invitations] Historical batch failed", error);
    return Response.json({ error: "Historical review invitations could not be completed." }, { status: 500 });
  }
}
