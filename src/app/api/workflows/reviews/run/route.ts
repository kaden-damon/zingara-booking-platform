import { getServiceClient } from "@/lib/supabase/serverAdmin";
import { runAutomatedWorkflows } from "@/lib/workflows/automatedWorkflows";
import { isAuthorisedWorkflowCronRequest } from "@/lib/workflows/cronAuthorization";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const workflowKey = "post_show_review" as const;

export async function GET(request: Request) {
  if (!isAuthorisedWorkflowCronRequest(request)) {
    return Response.json({ error: "Unauthorised workflow runner." }, { status: 401 });
  }

  const serviceClient = getServiceClient();
  if (!serviceClient) {
    return Response.json(
      { error: "Supabase service role is not configured." },
      { status: 500 },
    );
  }

  const startedAt = new Date().toISOString();
  const { data: run, error: runError } = await serviceClient
    .from("automated_workflow_runs")
    .insert({
      execution_mode: "send",
      source: "scheduled_review_invitation",
      started_at: startedAt,
      status: "running",
      workflow_key: workflowKey,
    })
    .select("id")
    .single();

  if (runError || !run) {
    console.error("[Review Invitations] Durable run evidence could not be created", runError);
    return Response.json(
      { error: "Review invitations could not start safely." },
      { status: 503 },
    );
  }

  try {
    const result = await runAutomatedWorkflows(serviceClient, {
      allowedRecipient: process.env.WORKFLOW_ALLOWED_RECIPIENT,
      mode: "send",
      workflowKey,
    });
    const summary = result.results[workflowKey];
    const completedAt = new Date().toISOString();
    const { error: completionError } = await serviceClient
      .from("automated_workflow_runs")
      .update({
        attempted_count: summary.attempted,
        completed_at: completedAt,
        deduplicated_count: summary.deduplicated,
        eligible_count: summary.eligible,
        failed_count: summary.failed,
        reason_counts: summary.reasons,
        sent_count: summary.sent,
        skipped_count: summary.skipped,
        status: "completed",
        suppressed_count: summary.suppressed,
      })
      .eq("id", run.id);

    if (completionError) throw completionError;

    return Response.json({
      completedAt,
      executionMode: "send",
      runId: run.id,
      summary,
      workflow: workflowKey,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown workflow failure";
    await serviceClient
      .from("automated_workflow_runs")
      .update({
        completed_at: new Date().toISOString(),
        error_message: message.slice(0, 1000),
        status: "failed",
      })
      .eq("id", run.id);
    console.error("[Review Invitations] Scheduled send failed", { runId: run.id, error });
    return Response.json(
      { error: "Review invitations could not be completed.", runId: run.id },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  return GET(request);
}
