import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("public booking exposes the approved compact Secret Guest List experience", async () => {
  const [page, panel] = await Promise.all([
    source("../app/book/page.tsx"),
    source("../app/book/SecretGuestListPanel.tsx"),
  ]);

  assert.match(page, /getGuestShowStatus\(show\) === "sold-out"/);
  assert.match(page, /setSecretGuestListShowId\(show\.id\)/);
  assert.match(page, /setSecretGuestListShowId\(selectedShowId\)/);
  assert.match(page, /<SecretGuestListPanel/);
  assert.match(panel, /The Secret Guest List/);
  assert.match(panel, /Sold out\? Not so fast…/);
  assert.match(panel, /See If (?:There&apos;s|There's) Room/);
  for (const field of [
    "Number of guests",
    "First name",
    "Surname",
    "Mobile number",
    "Email address",
  ]) {
    assert.match(panel, new RegExp(field));
  }
  assert.doesNotMatch(panel, /Preferred Seating|Guest Notes|account|password/i);
});

test("submission is atomic, duplicate-safe and leaves booking capacity untouched", async () => {
  const [route, server, migration] = await Promise.all([
    source("../app/api/waitlist/route.ts"),
    source("./supabase/waitlistServer.ts"),
    source("../../supabase/migrations/20261031060000_waitlist_communications_integrity.sql"),
  ]);

  assert.match(route, /after\(async \(\) =>/);
  assert.match(route, /duplicate: !result\.created/);
  assert.match(server, /create_public_waitlist_entry/);
  assert.match(migration, /pg_advisory_xact_lock/g);
  assert.match(migration, /waitlist\.status in \('active', 'contacted'\)/);
  assert.match(migration, /insert into public\.waitlist_entries/);
  assert.doesNotMatch(migration, /update public\.bookings|update public\.shows|show_tables|payments/);
});

test("staff delivery is idempotent and recorded in Communications", async () => {
  const workflow = await source("./email/secretGuestListEmail.ts");

  assert.match(workflow, /claimStaffEmailDelivery/);
  assert.match(workflow, /eventKey: input\.entry\.id/);
  assert.match(workflow, /completeStaffEmailDelivery/);
  assert.match(workflow, /insertCommunicationPayload/);
  assert.match(workflow, /customer_id: input\.customerId/);
  assert.match(workflow, /show_id: input\.showId/);
  assert.match(workflow, /replyTo: input\.entry\.customer\.email/);
});
