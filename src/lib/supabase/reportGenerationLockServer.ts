import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { AuditOutcome } from "@/lib/auditTrail";
import {
  reportGenerationLockTimeoutSeconds,
  type ReportGenerationLockResult,
  type ReportGenerationLockState,
} from "@/lib/reportGenerationLock";
import type { StaffProfileRow } from "@/lib/supabase/serverAdmin";
import {
  toAuditJsonValue,
  tryRecordAuditEvent,
} from "@/lib/supabase/serverAudit";

type LockRow = {
  acquired_at: string;
  actor_name: string | null;
  expires_at: string;
  report_type: string;
  staff_profile_id: string;
};

function toLockState(row: LockRow, staffProfileId?: string) {
  return {
    acquiredAt: row.acquired_at,
    expiresAt: row.expires_at,
    isOwner: staffProfileId === row.staff_profile_id,
    ownerName: row.actor_name,
    reportType: row.report_type,
  } satisfies ReportGenerationLockState;
}

export async function getReportGenerationLock(
  serviceClient: SupabaseClient,
  staffProfileId?: string,
) {
  const { data, error } = await serviceClient
    .from("report_generation_locks")
    .select("staff_profile_id,actor_name,report_type,acquired_at,expires_at")
    .eq("lock_key", "analytics-heavy-report")
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error) throw error;
  return data ? toLockState(data as LockRow, staffProfileId) : null;
}

export async function acquireReportGenerationLock(input: {
  reportScope: Record<string, unknown>;
  reportType: string;
  request: Request;
  serviceClient: SupabaseClient;
  staffProfile: StaffProfileRow;
  user: User;
}) {
  const { data, error } = await input.serviceClient.rpc(
    "acquire_report_generation_lock",
    {
      p_actor_name: input.staffProfile.full_name,
      p_report_scope: input.reportScope,
      p_report_type: input.reportType,
      p_staff_profile_id: input.staffProfile.id,
      p_timeout_seconds: reportGenerationLockTimeoutSeconds,
    },
  );

  if (error) throw error;
  const result = data as ReportGenerationLockResult;

  await tryRecordAuditEvent(
    input.serviceClient,
    input.staffProfile,
    input.user,
    {
      action: result.acquired
        ? result.staleRecovered
          ? "analytics.report_generation_started_after_stale_recovery"
          : "analytics.report_generation_started"
        : "analytics.report_generation_blocked",
      afterValues: {
        reportScope: toAuditJsonValue(input.reportScope),
        reportType: input.reportType,
        staleRecovered: result.staleRecovered,
      },
      entityId: result.token ?? null,
      entityReference: input.reportType,
      entityType: "report-generation",
      outcome: result.acquired ? "success" : "blocked",
      reason: result.acquired
        ? "Exclusive report generation lock acquired."
        : "Another report generation process owns the exclusive lock.",
      request: input.request,
      sourceArea: "Management Analytics",
    },
  );

  return result;
}

export async function releaseReportGenerationLock(input: {
  lockToken: string;
  outcome: Extract<AuditOutcome, "failed" | "success">;
  reason?: string;
  reportScope: Record<string, unknown>;
  reportType: string;
  request: Request;
  serviceClient: SupabaseClient;
  staffProfile: StaffProfileRow;
  user: User;
}) {
  const { data, error } = await input.serviceClient.rpc(
    "release_report_generation_lock",
    {
      p_lock_token: input.lockToken,
      p_staff_profile_id: input.staffProfile.id,
    },
  );

  if (error) throw error;

  await tryRecordAuditEvent(
    input.serviceClient,
    input.staffProfile,
    input.user,
    {
      action:
        input.outcome === "success"
          ? "analytics.report_generation_completed"
          : "analytics.report_generation_failed",
      afterValues: {
        released: Boolean(data),
        reportScope: toAuditJsonValue(input.reportScope),
        reportType: input.reportType,
      },
      entityId: input.lockToken,
      entityReference: input.reportType,
      entityType: "report-generation",
      outcome: input.outcome,
      reason:
        input.reason ??
        (input.outcome === "success"
          ? "Report generation completed and the exclusive lock was released."
          : "Report generation failed and the exclusive lock was released."),
      request: input.request,
      sourceArea: "Management Analytics",
    },
  );
}
