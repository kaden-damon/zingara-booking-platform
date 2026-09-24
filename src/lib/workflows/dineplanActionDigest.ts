import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildDineplanActionDigest,
  isDineplanPreShowEscalation,
  routeDineplanDigestAudiences,
} from "../dineplanActions.ts";
import {
  loadDineplanActionSettings,
  mapDineplanActionRow,
} from "../dineplanActionStore.ts";
import { sendZingaraEmail } from "../email/smtp.ts";
import { createBrandedCustomerEmail } from "../email/customerEmail.ts";

const productionAdminOrigin = "https://book.zingara.co.za";

function schemaUnavailable(error: { code?: string; message?: string } | null | undefined) {
  return error?.code === "42P01" || /dineplan_reconciliation_/i.test(error?.message ?? "");
}

export async function runDineplanActionDigest(client: SupabaseClient) {
  let settings;
  try {
    settings = await loadDineplanActionSettings(client);
  } catch (error) {
    if (schemaUnavailable(error as { code?: string; message?: string })) {
      return { available: false, delivered: false, reason: "migration_required" };
    }
    throw error;
  }
  if (!settings.hourlyRemindersEnabled) {
    return { available: true, delivered: false, reason: "disabled" };
  }
  if (!settings.actionRecipientStaffIds.length) {
    return { available: true, delivered: false, reason: "no_recipients" };
  }
  const { data: claimed, error: claimError } = await client.rpc(
    "claim_due_dineplan_reconciliation_actions",
    {
      p_limit: 500,
      p_normal_acknowledged_cadence_hours: settings.normalAcknowledgedCadenceHours,
    },
  );
  if (claimError) throw claimError;
  const claimedRows = (claimed ?? []) as Array<Record<string, unknown> & { id: string }>;
  if (!claimedRows.length) {
    return { available: true, delivered: false, reason: "no_due_actions" };
  }
  const recipientIds = [...new Set([
    ...settings.actionRecipientStaffIds,
    ...settings.corporateRecipientStaffIds,
    ...settings.managementCcStaffIds,
  ])];
  const { data: staff, error: staffError } = await client
    .from("staff_profiles")
    .select("id,full_name,email,venue_scope")
    .in("id", recipientIds)
    .eq("active", true)
    .not("email", "is", null);
  if (staffError) throw staffError;
  const staffById = new Map((staff ?? []).map((member) => [member.id, member]));
  const staffNames = new Map((staff ?? []).map((member) => [member.id, member.full_name]));
  const actions = claimedRows.map((row) => mapDineplanActionRow(row, staffNames));
  const releaseClaims = async (actionIds: string[]) => {
    if (actionIds.length) await client.from("dineplan_reconciliation_actions").update({ notification_claimed_at: null }).in("id", actionIds);
  };
  const recipients = (ids: string[]) => ids.flatMap((id) => {
    const member = staffById.get(id);
    return member?.email ? [{ id, venueScope: member.venue_scope ?? [] }] : [];
  });
  const cohorts = routeDineplanDigestAudiences({
    actions,
    corporateRecipients: recipients(settings.corporateRecipientStaffIds),
    generalRecipients: recipients(settings.actionRecipientStaffIds),
    managementRecipients: recipients(settings.managementCcStaffIds),
  });
  const plannedActionIds = new Set(cohorts.flatMap((cohort) => cohort.actions.map((action) => action.id)));
  const undeliverableActionIds = actions.filter((action) => !plannedActionIds.has(action.id)).map((action) => action.id);
  await releaseClaims(undeliverableActionIds);
  if (!cohorts.length) {
    return { available: true, delivered: false, reason: "configured_recipients_unavailable" };
  }

  const plannedDeliveryCounts = new Map<string, number>();
  const successfulDeliveryCounts = new Map<string, number>();
  const failedActionIds = new Set<string>();
  for (const cohort of cohorts) {
    for (const action of cohort.actions) {
      plannedDeliveryCounts.set(action.id, (plannedDeliveryCounts.get(action.id) ?? 0) + 1);
    }
  }
  const subjects: string[] = [];
  for (const cohort of cohorts) {
    const actionIds = cohort.actions.map((action) => action.id);
    const digest = buildDineplanActionDigest({ actions: cohort.actions, adminBaseUrl: productionAdminOrigin, settings });
    if (!digest) {
      actionIds.forEach((id) => failedActionIds.add(id));
      continue;
    }
    const branded = await createBrandedCustomerEmail({
      ctaLabel: "REVIEW IN ZINGARA",
      ctaUrl: `${productionAdminOrigin}/admin?section=platform-operations&system=dineplan`,
      heading: cohort.audience === "corporate" ? "Corporate Booking Action Digest" : "Box Office Action Digest",
      html: digest.html,
      includeAgePolicy: false,
      message: digest.message,
      subject: digest.subject,
    });
    const result = await sendZingaraEmail({
      attachments: branded.attachments,
      cc: cohort.ccIds.map((id) => staffById.get(id)?.email).filter((email): email is string => Boolean(email)),
      html: branded.html,
      message: branded.message,
      subject: digest.subject,
      to: cohort.toIds.map((id) => staffById.get(id)?.email).filter((email): email is string => Boolean(email)),
    });
    const now = new Date().toISOString();
    if (!result.ok) {
      actionIds.forEach((id) => failedActionIds.add(id));
      await client.from("dineplan_reconciliation_digest_deliveries").insert({
        action_ids: actionIds,
        audience: cohort.audience,
        cc_staff_ids: cohort.ccIds,
        delivery_type: digest.preShowEscalation ? "pre_show" : "hourly",
        error_message: result.error,
        recipient_staff_ids: cohort.toIds,
        status: "failed",
        subject: digest.subject,
      });
      await client.from("dineplan_reconciliation_action_events").insert(actionIds.map((actionId) => ({
        action_id: actionId,
        event_type: "digest_failed",
        metadata: { audience: cohort.audience, error: result.error },
      })));
      continue;
    }
    actionIds.forEach((id) => successfulDeliveryCounts.set(id, (successfulDeliveryCounts.get(id) ?? 0) + 1));
    const { error: deliveryError } = await client.from("dineplan_reconciliation_digest_deliveries").insert({
      action_ids: actionIds,
      audience: cohort.audience,
      cc_staff_ids: cohort.ccIds,
      delivered_at: now,
      delivery_type: digest.preShowEscalation ? "pre_show" : "hourly",
      recipient_staff_ids: cohort.toIds,
      status: "sent",
      subject: digest.subject,
    });
    if (deliveryError) throw deliveryError;
    const { error: eventError } = await client.from("dineplan_reconciliation_action_events").insert(actionIds.map((actionId) => ({
      action_id: actionId,
      event_type: "digest_sent",
      metadata: { audience: cohort.audience, subject: digest.subject },
    })));
    if (eventError) throw eventError;
    subjects.push(digest.subject);
  }
  const deliveredActionIds = actions
    .filter((action) => !failedActionIds.has(action.id) && (successfulDeliveryCounts.get(action.id) ?? 0) === plannedDeliveryCounts.get(action.id))
    .map((action) => action.id);
  const retryActionIds = actions.filter((action) => !deliveredActionIds.includes(action.id)).map((action) => action.id);
  await releaseClaims(retryActionIds);
  if (deliveredActionIds.length) {
    const now = new Date().toISOString();
    const { error: notifiedError } = await client
      .from("dineplan_reconciliation_actions")
      .update({ last_notified_at: now, notification_claimed_at: null, updated_at: now })
      .in("id", deliveredActionIds);
    if (notifiedError) throw notifiedError;
    const preShowIds = actions
      .filter((action) => deliveredActionIds.includes(action.id) && isDineplanPreShowEscalation(action, settings))
      .map((action) => action.id);
    if (preShowIds.length) {
      const { error } = await client.from("dineplan_reconciliation_actions").update({ last_escalated_at: now }).in("id", preShowIds);
      if (error) throw error;
    }
  }
  return deliveredActionIds.length
    ? { available: true, delivered: true, actionCount: deliveredActionIds.length, subjects }
    : { available: true, delivered: false, reason: "provider_failed" };
}
