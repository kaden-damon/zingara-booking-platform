import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("both public Waitlist sources use one atomic duplicate guard", async () => {
  const [route, server, migration] = await Promise.all([
    source("../app/api/waitlist/route.ts"),
    source("./supabase/waitlistServer.ts"),
    source("../../supabase/migrations/20261031060000_waitlist_communications_integrity.sql"),
  ]);

  assert.match(
    route,
    /const source: PublicWaitlistSource = standardEntry[\s\S]*\? "waitlist"[\s\S]*: "secret-guest-list"/,
  );
  assert.match(route, /createPublicWaitlistEntry/);
  assert.match(route, /duplicate: !result\.created/);
  assert.match(server, /create_public_waitlist_entry/);
  assert.match(migration, /pg_advisory_xact_lock/g);
  assert.match(migration, /waitlist\.status in \('active', 'contacted'\)/);
  assert.match(migration, /p_source not in \('waitlist', 'secret-guest-list'\)/);
  assert.doesNotMatch(migration, /delete from public\.waitlist_entries/i);
});

test("new standard enquiries notify staff and acknowledge the customer after the response", async () => {
  const [route, email] = await Promise.all([
    source("../app/api/waitlist/route.ts"),
    source("./email/secretGuestListEmail.ts"),
  ]);

  assert.match(route, /after\(async \(\) =>/);
  assert.match(route, /sendWaitlistStaffNotification/);
  assert.match(route, /sendWaitlistCustomerAcknowledgement/);
  assert.match(email, /notificationKey[\s\S]*new-waitlist-enquiry/);
  assert.match(email, /Preferred seating:/);
  assert.match(email, /Enquiry source:/);
  assert.match(email, /claimStaffEmailDelivery/);
  assert.match(email, /insertCommunicationPayload/);
});

test("standard customer acknowledgement is source-specific and duplicate-safe", async () => {
  const [acknowledgement, route, migration] = await Promise.all([
    source("./email/secretGuestListAcknowledgementEmail.ts"),
    source("../app/api/waitlist/route.ts"),
    source("../../supabase/migrations/20261031060000_waitlist_communications_integrity.sql"),
  ]);

  assert.match(acknowledgement, /You're on Zingara's Waitlist!/);
  assert.match(acknowledgement, /standard_waitlist_customer_acknowledgement/);
  assert.match(acknowledgement, /claimOneTimeEmailCommunication/);
  assert.match(acknowledgement, /does not constitute a confirmed booking/);
  assert.match(route, /if \(result\.created\)/);
  assert.match(migration, /communications_standard_waitlist_ack_once_uidx/);
  assert.doesNotMatch(migration, /update public\.waitlist_entries/i);
});

test("daily reminder is SAST scheduled, actionable-only and idempotent", async () => {
  const [workflow, runner, migration, preferences] = await Promise.all([
    source("./workflows/dailyWaitlistReminder.ts"),
    source("../app/api/workflows/run/route.ts"),
    source("../../supabase/migrations/20261031060000_waitlist_communications_integrity.sql"),
    source("./email/staffEmailNotifications.ts"),
  ]);

  assert.match(workflow, /const scheduleMinute = 8 \* 60/);
  assert.match(workflow, /timeZone: "Africa\/Johannesburg"/);
  assert.match(workflow, /\.in\("status", \["active", "contacted"\]\)/);
  assert.match(workflow, /performanceInstant\(entry\)\.getTime\(\) > now\.getTime\(\)/);
  assert.match(workflow, /claimStaffEmailDelivery/);
  assert.match(workflow, /claimOneTimeEmailCommunication/);
  assert.match(workflow, /Zingara Box Office — Your Daily Guest List/);
  assert.match(runner, /runDailyWaitlistReminder/);
  assert.match(migration, /communications_daily_waitlist_reminder_once_uidx/);
  assert.match(preferences, /key: "new-waitlist-enquiry"/);
  assert.match(preferences, /key: "daily-waitlist-reminder"/);
});

test("all Waitlist staff routes use the approved TO and CC recipients", async () => {
  const migration = await source(
    "../../supabase/migrations/20261031110000_staff_email_recipient_correction.sql",
  );

  for (const notificationKey of [
    "secret-guest-list",
    "new-waitlist-enquiry",
    "daily-waitlist-reminder",
  ]) {
    assert.match(migration, new RegExp(`'${notificationKey}'`));
  }
  assert.match(migration, /v_to uuid\[\] := array\[[\s\S]*bb58fd74-5995-4544-803a-6baaf0ec129b[\s\S]*92edf75d-06bf-4d40-a142-52b2862a3795[\s\S]*d185b639-054d-4c4f-8f6b-3c1e6fc205af[\s\S]*fe8dff17-a040-4296-afa1-49c058d070f4[\s\S]*\];/);
  assert.match(migration, /v_cc uuid\[\] := array\[[\s\S]*e8598359-54a0-4e1f-a635-1ec8ae02cb78[\s\S]*a021d26b-3a16-46b5-b184-6f33e58d1884[\s\S]*\];/);
  assert.doesNotMatch(migration, /3ac09b59-fc3f-4c6d-9bb3-8dd47a077188/);
  assert.doesNotMatch(migration, /eb6ce1ab-50c8-415a-a858-23ad58300ad8/);
  assert.match(migration, /v_route_count <> 3/);
});
