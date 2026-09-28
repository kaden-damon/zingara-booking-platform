import type { SupabaseClient } from "@supabase/supabase-js";
import {
  canReceiveDineplanVenue,
  getDueDineplanScheduleCheckpoint,
  getJohannesburgDateTimeParts,
  isDineplanSnapshotStale,
  type DineplanActionSettings,
  type DineplanScheduleCheckpoint,
} from "../dineplanActions.ts";
import { loadDineplanActionSettings } from "../dineplanActionStore.ts";
import { createBrandedCustomerEmail } from "../email/customerEmail.ts";
import { sendZingaraEmail } from "../email/smtp.ts";
import { normalizeShowLocation } from "../zingaraDemo.ts";
import { runDineplanActionDigest } from "./dineplanActionDigest.ts";

const productionAdminOrigin = "https://book.zingara.co.za";

type OperationalShow = {
  date: string;
  id: string;
  name: string;
  status: string;
  time: string;
  venue: string;
};

type SourceState = {
  generatedAt: string | null;
  id: string | null;
  state: "current" | "missing" | "stale" | "untrusted";
};

function showAt(show: OperationalShow) {
  return Date.parse(`${show.date}T${show.time.slice(0, 5)}:00+02:00`);
}

function checkpointAt(date: string, time: string) {
  return new Date(`${date}T${time}:00+02:00`).toISOString();
}

function venueLabel(venue: "cape-town" | "johannesburg") {
  return venue === "cape-town" ? "Cape Town" : "Johannesburg";
}

function formatShow(show: OperationalShow) {
  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Africa/Johannesburg",
  }).format(new Date(`${show.date}T${show.time.slice(0, 5)}:00+02:00`));
}

function formatSourceAge(value: string | null, now: Date) {
  if (!value || !Number.isFinite(Date.parse(value))) return "Unknown";
  const minutes = Math.max(0, Math.round((now.getTime() - Date.parse(value)) / 60_000));
  if (minutes < 120) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.round(minutes / 60);
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}

export function buildDineplanSourceReminder(input: {
  checkpoint: DineplanScheduleCheckpoint;
  now: Date;
  show: OperationalShow;
  source: SourceState;
  venue: "cape-town" | "johannesburg";
}) {
  const urgent = input.checkpoint === "final";
  const heading = urgent
    ? "URGENT - Dineplan File Needed Before Service"
    : input.source.state === "untrusted"
      ? "Dineplan File Needs Review"
      : "Dineplan File Needed";
  const sourceDetail = input.source.state === "missing"
    ? "No Dineplan file has been uploaded for this performance."
    : input.source.state === "untrusted"
      ? "We couldn't safely compare the latest Dineplan file. No booking actions were created from it."
      : `The Dineplan file may be out of date. Last updated ${formatSourceAge(input.source.generatedAt, input.now)} ago.`;
  const instruction = input.source.state === "untrusted"
    ? "Review the file in Zingara and upload a new Dineplan PDF if needed."
    : "Export the latest Dineplan PDF and upload it in Zingara.";
  const showLabel = `${venueLabel(input.venue)} - ${formatShow(input.show)}`;
  return {
    heading,
    html: `<h2>${heading}</h2><p><strong>${showLabel}</strong></p><p>${sourceDetail}</p><p>${instruction}</p>`,
    message: [heading, "", showLabel, sourceDetail, instruction, "", `Open in Zingara: ${productionAdminOrigin}/admin?section=platform-operations&system=dineplan`].join("\n"),
    subject: urgent
      ? `URGENT - Dineplan file needed before service | ${venueLabel(input.venue)}`
      : `${heading} | ${venueLabel(input.venue)} ${input.show.date}`,
  };
}

async function latestSourceForShow(
  client: SupabaseClient,
  show: OperationalShow,
  settings: DineplanActionSettings,
  now: Date,
): Promise<SourceState> {
  const venue = normalizeShowLocation(show.venue);
  if (!venue) return { generatedAt: null, id: null, state: "missing" };
  const { data, error } = await client
    .from("dineplan_reconciliation_snapshots")
    .select("id,show_id,status,performance_time,source_generated_at,uploaded_at")
    .eq("performance_date", show.date)
    .eq("venue", venue)
    .order("uploaded_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  const source = (data ?? []).find((row) =>
    row.show_id === show.id || row.performance_time?.slice(0, 5) === show.time.slice(0, 5),
  );
  if (!source) return { generatedAt: null, id: null, state: "missing" };
  if (source.status !== "reconciled") {
    return { generatedAt: source.source_generated_at, id: source.id, state: "untrusted" };
  }
  return {
    generatedAt: source.source_generated_at,
    id: source.id,
    state: isDineplanSnapshotStale(source.source_generated_at, settings, now)
      ? "stale"
      : "current",
  };
}

async function finishCheckpoint(
  client: SupabaseClient,
  id: string,
  input: {
    deliveryKind: string;
    errorMessage?: string | null;
    result: string;
    sourceSnapshotId?: string | null;
    status: "failed" | "sent" | "skipped";
  },
) {
  const { error } = await client
    .from("dineplan_reconciliation_schedule_runs")
    .update({
      completed_at: new Date().toISOString(),
      delivery_kind: input.deliveryKind,
      error_message: input.errorMessage ?? null,
      result: input.result,
      source_snapshot_id: input.sourceSnapshotId ?? null,
      status: input.status,
    })
    .eq("id", id);
  if (error) throw error;
}

async function claimCheckpoint(
  client: SupabaseClient,
  show: OperationalShow,
  venue: "cape-town" | "johannesburg",
  checkpoint: DineplanScheduleCheckpoint,
  scheduledAt: string,
) {
  const { data, error } = await client.rpc("claim_dineplan_schedule_checkpoint", {
    p_checkpoint_at: scheduledAt,
    p_checkpoint_date: show.date,
    p_checkpoint_name: checkpoint,
    p_performance_date: show.date,
    p_show_id: show.id,
    p_venue: venue,
  });
  if (error) throw error;
  return typeof data === "string" ? data : null;
}

async function sendSourceReminder(
  client: SupabaseClient,
  settings: DineplanActionSettings,
  show: OperationalShow,
  venue: "cape-town" | "johannesburg",
  checkpoint: DineplanScheduleCheckpoint,
  source: SourceState,
  now: Date,
) {
  const recipientIds = [...new Set([
    ...settings.actionRecipientStaffIds,
    ...settings.managementCcStaffIds,
  ])];
  const { data, error } = await client
    .from("staff_profiles")
    .select("id,email,venue_scope")
    .in("id", recipientIds)
    .eq("active", true)
    .not("email", "is", null);
  if (error) throw error;
  const byId = new Map((data ?? []).map((member) => [member.id, member]));
  const scopedRecipients = (ids: string[]) => ids.flatMap((id) => {
    const staff = byId.get(id);
    return staff?.email && canReceiveDineplanVenue(staff.venue_scope ?? [], venue)
      ? [{ email: staff.email, id }]
      : [];
  });
  const toRecipients = scopedRecipients(settings.actionRecipientStaffIds);
  const ccRecipients = scopedRecipients(settings.managementCcStaffIds)
    .filter((recipient) => !toRecipients.some((to) => to.id === recipient.id));
  const to = toRecipients.map((recipient) => recipient.email);
  const cc = ccRecipients.map((recipient) => recipient.email);
  if (!to.length) return { ok: false as const, reason: "no_scoped_recipients" };
  const content = buildDineplanSourceReminder({ checkpoint, now, show, source, venue });
  const branded = await createBrandedCustomerEmail({
    ctaLabel: "OPEN DINEPLAN RECONCILIATION",
    ctaUrl: `${productionAdminOrigin}/admin?section=platform-operations&system=dineplan`,
    heading: content.heading,
    html: content.html,
    includeAgePolicy: false,
    message: content.message,
    subject: content.subject,
  });
  const result = await sendZingaraEmail({
    attachments: branded.attachments,
    cc,
    html: branded.html,
    message: branded.message,
    subject: content.subject,
    to,
  });
  if (!result.ok) return { ok: false as const, reason: result.error };
  const { error: deliveryError } = await client
    .from("dineplan_reconciliation_digest_deliveries")
    .insert({
      action_ids: [],
      audience: "general",
      cc_staff_ids: ccRecipients.map((recipient) => recipient.id),
      delivered_at: new Date().toISOString(),
      delivery_type: "upload_reminder",
      recipient_staff_ids: toRecipients.map((recipient) => recipient.id),
      status: "sent",
      subject: content.subject,
    });
  if (deliveryError) throw deliveryError;
  return { ok: true as const, subject: content.subject };
}

export async function runDineplanScheduledEmails(
  client: SupabaseClient,
  now = new Date(),
) {
  const settings = await loadDineplanActionSettings(client);
  if (!settings.scheduledEmailsEnabled) {
    return { available: true, delivered: 0, reason: "disabled" as const };
  }
  const due = getDueDineplanScheduleCheckpoint(settings, now);
  if (!due) {
    return { available: true, delivered: 0, reason: "between_checkpoints" as const };
  }
  const sast = getJohannesburgDateTimeParts(now);
  const { data, error } = await client
    .from("shows")
    .select("id,name,date,time,venue,status")
    .eq("date", sast.date)
    .in("status", ["active", "sold_out", "special_event"])
    .order("time", { ascending: true });
  if (error) throw error;
  const shows = ((data ?? []) as OperationalShow[]).filter((show) => showAt(show) >= now.getTime());
  if (!shows.length) {
    return { available: true, delivered: 0, reason: "no_operational_performances" as const };
  }
  let delivered = 0;
  const results: Array<{ checkpoint: DineplanScheduleCheckpoint; result: string; showId: string }> = [];
  for (const show of shows) {
    const venue = normalizeShowLocation(show.venue);
    if (!venue) continue;
    const scheduledAt = checkpointAt(show.date, due.time);
    const runId = await claimCheckpoint(client, show, venue, due.name, scheduledAt);
    if (!runId) continue;
    try {
      const source = await latestSourceForShow(client, show, settings, now);
      if (source.state === "current") {
        const digest = await runDineplanActionDigest(client, {
          checkpointAt: scheduledAt,
          mode: "scheduled",
          showIds: [show.id],
        });
        const sent = digest.delivered === true;
        await finishCheckpoint(client, runId, {
          deliveryKind: "action_digest",
          result: sent ? "action_digest_sent" : digest.reason ?? "no_due_actions",
          sourceSnapshotId: source.id,
          status: sent ? "sent" : digest.reason === "provider_failed" ? "failed" : "skipped",
        });
        if (sent) delivered += 1;
        results.push({ checkpoint: due.name, result: sent ? "action_digest_sent" : digest.reason ?? "no_due_actions", showId: show.id });
        continue;
      }
      const reminder = await sendSourceReminder(client, settings, show, venue, due.name, source, now);
      await finishCheckpoint(client, runId, {
        deliveryKind: source.state === "untrusted" ? "review_reminder" : "upload_reminder",
        errorMessage: reminder.ok ? null : reminder.reason,
        result: reminder.ok ? `${source.state}_source_reminder_sent` : reminder.reason,
        sourceSnapshotId: source.id,
        status: reminder.ok ? "sent" : reminder.reason === "no_scoped_recipients" ? "skipped" : "failed",
      });
      if (reminder.ok) delivered += 1;
      results.push({ checkpoint: due.name, result: reminder.ok ? `${source.state}_source_reminder_sent` : reminder.reason, showId: show.id });
    } catch (error) {
      await finishCheckpoint(client, runId, {
        deliveryKind: "none",
        errorMessage: error instanceof Error ? error.message : "Unknown scheduled Dineplan error",
        result: "failed",
        status: "failed",
      });
      throw error;
    }
  }
  return { available: true, checkpoint: due.name, delivered, results };
}
