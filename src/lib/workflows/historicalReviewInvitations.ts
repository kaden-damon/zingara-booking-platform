import type { SupabaseClient } from "@supabase/supabase-js";
import { runAutomatedWorkflows } from "@/lib/workflows/automatedWorkflows";

export const historicalReviewStart = new Date("2026-09-01T00:00:00+02:00");
export const historicalReviewApprovedMaximum = 542;
export const historicalReviewBatchSize = 25;

const workflowKey = "post_show_review" as const;

export async function planHistoricalReviewInvitations(
  serviceClient: SupabaseClient,
  now = new Date(),
) {
  const result = await runAutomatedWorkflows(serviceClient, {
    mode: "dry-run",
    now,
    reviewWindow: { end: now, start: historicalReviewStart },
    workflowKey,
  });
  const summary = result.results[workflowKey];
  const unexpected = summary.performanceBreakdown.filter(
    (row) =>
      !["cape-town", "johannesburg"].includes(row.venue) ||
      row.date < "2026-09-01",
  );
  if (unexpected.length > 0) {
    throw new Error("HISTORICAL_REVIEW_SCOPE_MISMATCH");
  }
  return summary;
}

async function loadPausedRun(serviceClient: SupabaseClient) {
  const { data, error } = await serviceClient
    .from("historical_review_invitation_runs")
    .select("id,eligible_count,sent_count,failed_count,suppressed_count,deduplicated_count")
    .eq("period_start", "2026-09-01")
    .eq("status", "paused")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function startHistoricalReviewInvitations(
  serviceClient: SupabaseClient,
  now = new Date(),
) {
  const existing = await loadPausedRun(serviceClient);
  if (existing) {
    return continueHistoricalReviewInvitations(serviceClient, now);
  }

  const plan = await planHistoricalReviewInvitations(serviceClient, now);
  if (plan.eligible > historicalReviewApprovedMaximum) {
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
    return { blocked: true as const, plan, runId: run.id };
  }

  const { data: run, error } = await serviceClient
    .from("historical_review_invitation_runs")
    .insert({
      breakdown: plan.performanceBreakdown,
      eligible_count: plan.eligible,
      period_end: now.toISOString(),
      period_start: "2026-09-01",
      reason_counts: plan.reasons,
      started_at: now.toISOString(),
      status: plan.eligible === 0 ? "completed" : "paused",
      completed_at: plan.eligible === 0 ? now.toISOString() : null,
    })
    .select("id")
    .single();
  if (error) throw error;
  if (plan.eligible === 0) {
    return { blocked: false as const, plan, remaining: 0, runId: run.id, summary: null };
  }
  return continueHistoricalReviewInvitations(serviceClient, now);
}

export async function continueHistoricalReviewInvitations(
  serviceClient: SupabaseClient,
  now = new Date(),
) {
  const paused = await loadPausedRun(serviceClient);
  if (!paused) return null;

  const { data: run, error: claimError } = await serviceClient
    .from("historical_review_invitation_runs")
    .update({ status: "running", updated_at: now.toISOString() })
    .eq("id", paused.id)
    .eq("status", "paused")
    .select("id,eligible_count,sent_count,failed_count,suppressed_count,deduplicated_count")
    .maybeSingle();
  if (claimError) throw claimError;
  if (!run) return null;

  try {
    const plan = await planHistoricalReviewInvitations(serviceClient, now);
    if (plan.eligible > run.eligible_count) {
      throw new Error("HISTORICAL_REVIEW_POPULATION_INCREASED");
    }
    const result = await runAutomatedWorkflows(serviceClient, {
      allowedRecipient: process.env.WORKFLOW_ALLOWED_RECIPIENT,
      maxDeliveries: historicalReviewBatchSize,
      mode: "send",
      now,
      reviewWindow: { end: now, start: historicalReviewStart },
      workflowKey,
    });
    const summary = result.results[workflowKey];
    const after = await planHistoricalReviewInvitations(serviceClient, new Date());
    const failed = run.failed_count + summary.failed;
    const status = summary.failed > 0 ? "failed" : after.eligible === 0 ? "completed" : "paused";
    const completedAt = status === "completed" || status === "failed" ? new Date().toISOString() : null;
    const { error: completionError } = await serviceClient
      .from("historical_review_invitation_runs")
      .update({
        completed_at: completedAt,
        deduplicated_count: run.deduplicated_count + summary.deduplicated,
        error_message: summary.failed > 0 ? "One or more invitation deliveries failed." : null,
        failed_count: failed,
        reason_counts: after.reasons,
        sent_count: run.sent_count + summary.sent,
        status,
        suppressed_count: run.suppressed_count + summary.suppressed,
        updated_at: new Date().toISOString(),
      })
      .eq("id", run.id)
      .eq("status", "running");
    if (completionError) throw completionError;
    return {
      blocked: false as const,
      remaining: after.eligible,
      runId: run.id,
      status,
      summary,
    };
  } catch (error) {
    await serviceClient
      .from("historical_review_invitation_runs")
      .update({
        completed_at: new Date().toISOString(),
        error_message: (error instanceof Error ? error.message : "Historical invitation batch failed").slice(0, 1000),
        status: "failed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", run.id)
      .eq("status", "running");
    throw error;
  }
}
