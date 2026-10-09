import { getServiceClient } from "@/lib/supabase/serverAdmin";
import { runAutomatedWorkflows } from "@/lib/workflows/automatedWorkflows";
import { isAuthorisedWorkflowCronRequest } from "@/lib/workflows/cronAuthorization";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const historicalStart = new Date("2026-09-01T00:00:00+02:00");
const maximumApprovedPopulation = 500;
const deliveryBatchSize = 25;
const workflowKey = "post_show_review" as const;

async function planHistoricalInvitations(now = new Date()) {
  const serviceClient = getServiceClient();
  if (!serviceClient) throw new Error("Supabase service role is not configured.");
  const result = await runAutomatedWorkflows(serviceClient, {
    mode: "dry-run",
    now,
    reviewWindow: { end: now, start: historicalStart },
    workflowKey,
  });
  return { serviceClient, summary: result.results[workflowKey] };
}

export async function GET(request: Request) {
  if (!isAuthorisedWorkflowCronRequest(request)) {
    return Response.json({ error: "Unauthorised workflow runner." }, { status: 401 });
  }
  try {
    const { summary } = await planHistoricalInvitations();
    return Response.json({
      approvedMaximum: maximumApprovedPopulation,
      canDispatch: summary.eligible <= maximumApprovedPopulation,
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
    const { serviceClient, summary: plan } = await planHistoricalInvitations(now);
    if (plan.eligible > maximumApprovedPopulation) {
      const { data: run, error } = await serviceClient
        .from("historical_review_invitation_runs")
        .insert({
          breakdown: plan.performanceBreakdown,
          eligible_count: plan.eligible,
          period_end: now.toISOString(),
          period_start: "2026-09-01",
          reason_counts: plan.reasons,
          status: "blocked",
        })
        .select("id")
        .single();
      if (error) throw error;
      return Response.json(
        {
          error: `Historical send blocked: ${plan.eligible} eligible bookings exceed the approved maximum of ${maximumApprovedPopulation}.`,
          runId: run.id,
          summary: plan,
        },
        { status: 409 },
      );
    }

    const { data: run, error: runError } = await serviceClient
      .from("historical_review_invitation_runs")
      .insert({
        breakdown: plan.performanceBreakdown,
        eligible_count: plan.eligible,
        period_end: now.toISOString(),
        period_start: "2026-09-01",
        reason_counts: plan.reasons,
        started_at: now.toISOString(),
        status: "running",
      })
      .select("id")
      .single();
    if (runError || !run) throw runError ?? new Error("Historical run could not be recorded.");

    const result = await runAutomatedWorkflows(serviceClient, {
      allowedRecipient: process.env.WORKFLOW_ALLOWED_RECIPIENT,
      maxDeliveries: deliveryBatchSize,
      mode: "send",
      now,
      reviewWindow: { end: now, start: historicalStart },
      workflowKey,
    });
    const summary = result.results[workflowKey];
    const remaining = Math.max(0, plan.eligible - summary.sent - summary.suppressed);
    const { error: completionError } = await serviceClient
      .from("historical_review_invitation_runs")
      .update({
        completed_at: new Date().toISOString(),
        deduplicated_count: summary.deduplicated,
        failed_count: summary.failed,
        sent_count: summary.sent,
        status: remaining === 0 ? "completed" : "paused",
        suppressed_count: summary.suppressed,
        updated_at: new Date().toISOString(),
      })
      .eq("id", run.id);
    if (completionError) throw completionError;

    return Response.json({
      batchSize: deliveryBatchSize,
      remaining,
      runId: run.id,
      summary,
      workflow: "historical_post_show_review",
    });
  } catch (error) {
    console.error("[Review Invitations] Historical batch failed", error);
    return Response.json({ error: "Historical review invitations could not be completed." }, { status: 500 });
  }
}
