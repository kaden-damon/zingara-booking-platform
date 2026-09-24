import type { SupabaseClient } from "@supabase/supabase-js";
import {
  defaultDineplanActionSettings,
  deriveDineplanActionCandidates,
  getDineplanActionTransition,
  type DineplanActionRecord,
  type DineplanActionCandidate,
  type DineplanActionSettings,
} from "./dineplanActions.ts";
import type { DineplanReconciliationResult } from "./dineplanReconciliation.ts";

type SyncInput = {
  comparedAt: string;
  performanceDate: string;
  performanceTime: string | null;
  results: DineplanReconciliationResult[];
  showId: string;
  snapshotId: string;
  sourceGeneratedAt: string | null;
  venue: "cape-town" | "johannesburg";
};

type ExistingAction = {
  action_key: string;
  id: string;
  material_fingerprint: string;
  status: "acknowledged" | "no_action" | "resolved" | "unacknowledged";
};

export const dineplanActionSelect = "id,action_key,action_kind,booking_id,booking_kind,booking_reference,capacity_impact,classification,dineplan_state,guest_label,first_detected_at,last_detected_at,last_notified_at,latest_snapshot_id,manual_action,material_fingerprint,pax,performance_date,performance_time,severity,show_id,source_generated_at,source_result_key,status,venue,zingara_state,zone,acknowledged_by,acknowledged_at,no_action_by,no_action_at,no_action_reason,resolved_at";

export function mapDineplanActionRow(
  row: Record<string, unknown>,
  staffNames: Map<string, string> = new Map(),
): DineplanActionRecord {
  return {
    acknowledgedAt: typeof row.acknowledged_at === "string" ? row.acknowledged_at : null,
    acknowledgedByName: typeof row.acknowledged_by === "string" ? staffNames.get(row.acknowledged_by) ?? null : null,
    actionKey: String(row.action_key),
    actionKind: row.action_kind as DineplanActionRecord["actionKind"],
    bookingId: typeof row.booking_id === "string" ? row.booking_id : null,
    bookingKind: row.booking_kind as DineplanActionRecord["bookingKind"],
    bookingReference: typeof row.booking_reference === "string" ? row.booking_reference : null,
    capacityImpact: Number(row.capacity_impact) || 0,
    classification: row.classification as DineplanActionRecord["classification"],
    dineplanState: String(row.dineplan_state ?? ""),
    firstDetectedAt: String(row.first_detected_at),
    guestLabel: String(row.guest_label),
    id: String(row.id),
    lastDetectedAt: String(row.last_detected_at),
    lastNotifiedAt: typeof row.last_notified_at === "string" ? row.last_notified_at : null,
    manualAction: String(row.manual_action),
    materialFingerprint: String(row.material_fingerprint),
    noActionAt: typeof row.no_action_at === "string" ? row.no_action_at : null,
    noActionByName: typeof row.no_action_by === "string" ? staffNames.get(row.no_action_by) ?? null : null,
    noActionReason: typeof row.no_action_reason === "string" ? row.no_action_reason : null,
    pax: Number(row.pax) || 0,
    performanceDate: String(row.performance_date),
    performanceTime: typeof row.performance_time === "string" ? row.performance_time : null,
    resolvedAt: typeof row.resolved_at === "string" ? row.resolved_at : null,
    severity: row.severity as DineplanActionRecord["severity"],
    showId: String(row.show_id),
    snapshotId: String(row.latest_snapshot_id),
    sourceGeneratedAt: typeof row.source_generated_at === "string" ? row.source_generated_at : null,
    sourceResultKey: String(row.source_result_key),
    status: row.status as DineplanActionRecord["status"],
    venue: row.venue as DineplanActionRecord["venue"],
    zingaraState: String(row.zingara_state ?? ""),
    zone: typeof row.zone === "string" ? row.zone : null,
  };
}

function candidateRow(candidate: DineplanActionCandidate, comparedAt: string) {
  return {
    action_key: candidate.actionKey,
    action_kind: candidate.actionKind,
    booking_id: candidate.bookingId,
    booking_kind: candidate.bookingKind,
    booking_reference: candidate.bookingReference,
    capacity_impact: candidate.capacityImpact,
    classification: candidate.classification,
    dineplan_state: candidate.dineplanState,
    guest_label: candidate.guestLabel,
    last_detected_at: comparedAt,
    latest_snapshot_id: candidate.snapshotId,
    manual_action: candidate.manualAction,
    material_fingerprint: candidate.materialFingerprint,
    pax: candidate.pax,
    performance_date: candidate.performanceDate,
    performance_time: candidate.performanceTime,
    severity: candidate.severity,
    show_id: candidate.showId,
    source_generated_at: candidate.sourceGeneratedAt,
    source_result_key: candidate.sourceResultKey,
    updated_at: comparedAt,
    venue: candidate.venue,
    zingara_state: candidate.zingaraState,
    zone: candidate.zone,
  };
}

async function insertEvent(
  client: SupabaseClient,
  input: {
    actionId: string;
    actorStaffProfileId?: string | null;
    eventType: string;
    metadata?: Record<string, unknown>;
    snapshotId?: string | null;
  },
) {
  const { error } = await client.from("dineplan_reconciliation_action_events").insert({
    action_id: input.actionId,
    actor_staff_profile_id: input.actorStaffProfileId ?? null,
    event_type: input.eventType,
    metadata: input.metadata ?? {},
    snapshot_id: input.snapshotId ?? null,
  });
  if (error) throw error;
}

export async function syncDineplanReconciliationActions(
  client: SupabaseClient,
  input: SyncInput,
) {
  const candidates = deriveDineplanActionCandidates(input);
  const { data, error } = await client
    .from("dineplan_reconciliation_actions")
    .select("id,action_key,material_fingerprint,status")
    .eq("show_id", input.showId);
  if (error) throw error;
  const existing = new Map((data ?? []).map((row) => [row.action_key, row as ExistingAction]));
  const currentKeys = new Set(candidates.map((candidate) => candidate.actionKey));

  for (const candidate of candidates) {
    const prior = existing.get(candidate.actionKey);
    if (!prior) {
      const { data: created, error: createError } = await client
        .from("dineplan_reconciliation_actions")
        .upsert({
          ...candidateRow(candidate, input.comparedAt),
          first_detected_at: input.comparedAt,
          status: "unacknowledged",
        }, { ignoreDuplicates: true, onConflict: "action_key" })
        .select("id")
        .maybeSingle();
      if (createError) throw createError;
      if (created) {
        await insertEvent(client, {
          actionId: created.id,
          eventType: "created",
          metadata: { actionKind: candidate.actionKind, severity: candidate.severity },
          snapshotId: input.snapshotId,
        });
      }
      continue;
    }

    const materiallyChanged = prior.material_fingerprint !== candidate.materialFingerprint;
    const transition = getDineplanActionTransition({ materiallyChanged, presentInLatestReconciliation: true, status: prior.status });
    const updates: Record<string, unknown> = candidateRow(candidate, input.comparedAt);
    if (transition.status === "unacknowledged" && transition.event) {
      Object.assign(updates, {
        acknowledged_at: null,
        acknowledged_by: null,
        acknowledgement_note: null,
        no_action_at: null,
        no_action_by: null,
        no_action_reason: null,
        resolved_at: null,
        resolved_by_snapshot_id: null,
        status: "unacknowledged",
      });
    }
    const { error: updateError } = await client
      .from("dineplan_reconciliation_actions")
      .update(updates)
      .eq("id", prior.id);
    if (updateError) throw updateError;
    if (transition.event) {
      await insertEvent(client, {
        actionId: prior.id,
        eventType: transition.event,
        metadata: { previousFingerprint: prior.material_fingerprint },
        snapshotId: input.snapshotId,
      });
    }
  }

  for (const prior of existing.values()) {
    if (currentKeys.has(prior.action_key)) continue;
    const transition = getDineplanActionTransition({ materiallyChanged: false, presentInLatestReconciliation: false, status: prior.status });
    if (transition.status !== "resolved" || !transition.event) continue;
    const { data: resolved, error: resolutionError } = await client
      .from("dineplan_reconciliation_actions")
      .update({
        latest_snapshot_id: input.snapshotId,
        resolved_at: input.comparedAt,
        resolved_by_snapshot_id: input.snapshotId,
        status: "resolved",
        updated_at: input.comparedAt,
      })
      .eq("id", prior.id)
      .in("status", ["acknowledged", "unacknowledged"])
      .select("id")
      .maybeSingle();
    if (resolutionError) throw resolutionError;
    if (resolved) {
      await insertEvent(client, {
        actionId: prior.id,
        eventType: "resolved_by_reconciliation",
        snapshotId: input.snapshotId,
      });
    }
  }
  return candidates;
}

export async function loadDineplanActionSettings(client: SupabaseClient): Promise<DineplanActionSettings> {
  const { data, error } = await client
    .from("dineplan_reconciliation_settings")
    .select("action_recipient_staff_ids,corporate_recipient_staff_ids,management_cc_staff_ids,hourly_reminders_enabled,normal_acknowledged_cadence_hours,pre_show_escalation_hours,snapshot_stale_hours")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return defaultDineplanActionSettings;
  return {
    actionRecipientStaffIds: data.action_recipient_staff_ids ?? [],
    corporateRecipientStaffIds: data.corporate_recipient_staff_ids ?? [],
    hourlyRemindersEnabled: Boolean(data.hourly_reminders_enabled),
    managementCcStaffIds: data.management_cc_staff_ids ?? [],
    normalAcknowledgedCadenceHours: Number(data.normal_acknowledged_cadence_hours) || 3,
    preShowEscalationHours: Number(data.pre_show_escalation_hours) || 3,
    snapshotStaleHours: Number(data.snapshot_stale_hours) || 24,
  };
}

export async function recordDineplanActionEvent(
  client: SupabaseClient,
  input: Parameters<typeof insertEvent>[1],
) {
  return insertEvent(client, input);
}
