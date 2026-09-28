import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(
  new URL("./workflows/dineplanScheduledEmails.ts", import.meta.url),
  "utf8",
);
const digest = readFileSync(
  new URL("./workflows/dineplanActionDigest.ts", import.meta.url),
  "utf8",
);
const migration = readFileSync(
  new URL("../../supabase/migrations/20260928220000_phase_41_2w_p0_h_dineplan_daily_schedule.sql", import.meta.url),
  "utf8",
);
const admin = readFileSync(
  new URL("../app/admin/DineplanActionCentre.tsx", import.meta.url),
  "utf8",
);
const route = readFileSync(
  new URL("../app/api/admin/dineplan-reconciliation/actions/route.ts", import.meta.url),
  "utf8",
);

test("schedule defaults are persisted configuration and the prior enabled state is preserved", () => {
  assert.match(migration, /default time '09:00'/);
  assert.match(migration, /default time '12:00'/);
  assert.match(migration, /default time '15:30'/);
  assert.match(migration, /scheduled_emails_enabled = hourly_reminders_enabled/);
  assert.match(route, /scheduled_emails_enabled: settings\.scheduledEmailsEnabled/);
  assert.doesNotMatch(workflow, /09:00|12:00|15:30/);
});

test("server validation rejects malformed, duplicate and unordered checkpoints", () => {
  assert.match(route, /validateDineplanEmailSchedule/);
  assert.match(migration, /morning_email_time < midday_email_time/);
  assert.match(migration, /midday_email_time < final_email_time/);
  assert.match(admin, /type="time"/);
  assert.match(admin, /Timezone: SAST/);
});

test("checkpoint delivery is atomically claimed once and failed claims remain retryable", () => {
  assert.match(migration, /unique \(show_id, checkpoint_date, checkpoint_name\)/);
  assert.match(migration, /on conflict \(show_id, checkpoint_date, checkpoint_name\)/);
  assert.match(migration, /status = 'failed'/);
  assert.match(migration, /claimed_at < now\(\) - interval '15 minutes'/);
  assert.match(workflow, /claim_dineplan_schedule_checkpoint/);
  assert.match(workflow, /finishCheckpoint/);
});

test("polling between checkpoints sends nothing and past shows are excluded", () => {
  assert.match(workflow, /reason: "between_checkpoints"/);
  assert.match(workflow, /showAt\(show\) >= now\.getTime\(\)/);
  assert.match(workflow, /\["active", "sold_out", "special_event"\]/);
});

test("trusted sources use the existing action digest and source problems use upload or review reminders", () => {
  assert.match(workflow, /source\.state === "current"/);
  assert.match(workflow, /runDineplanActionDigest/);
  assert.match(workflow, /source\.state === "untrusted"/);
  assert.match(workflow, /No operational actions were generated/);
  assert.match(workflow, /latest trusted Dineplan source is stale/);
  assert.match(workflow, /No Dineplan source has been uploaded/);
});

test("source reminders reuse staff IDs, venue scope and the shared branded mailer", () => {
  assert.match(workflow, /settings\.actionRecipientStaffIds/);
  assert.match(workflow, /settings\.managementCcStaffIds/);
  assert.match(workflow, /canReceiveDineplanVenue/);
  assert.match(workflow, /createBrandedCustomerEmail/);
  assert.match(workflow, /OPEN DINEPLAN RECONCILIATION/);
  assert.match(workflow, /message: branded\.message/);
  assert.doesNotMatch(workflow, /fatima@|jacques@|michael@|lisa@/i);
});

test("scheduled and immediate digests share claims and suppress near-checkpoint duplicates", () => {
  assert.match(digest, /p_notified_before/);
  assert.match(digest, /30 \* 60_000/);
  assert.match(digest, /p_show_ids/);
  assert.match(digest, /mode\?: "immediate" \| "scheduled"/);
  assert.match(migration, /p_notified_before timestamptz default null/);
  assert.match(migration, /a\.last_notified_at <= p_notified_before/);
});

test("scheduled source delivery never mutates authoritative business tables", () => {
  for (const table of ["bookings", "payments", "show_tables", "tickets", "customers"]) {
    assert.doesNotMatch(workflow, new RegExp(`from\\(\\"${table}\\"\\)[\\s\\S]{0,160}\\.(?:insert|update|delete|upsert)\\(`));
  }
});
