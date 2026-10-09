import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = process.cwd();
const scopedRoutePath = `${root}/src/app/api/workflows/reviews/run/route.ts`;
const sharedRoutePath = `${root}/src/app/api/workflows/run/route.ts`;
const workflowPath = `${root}/src/lib/workflows/automatedWorkflows.ts`;
const migrationPath = `${root}/supabase/migrations/20261009082000_p0_review_invitation_scheduler.sql`;

test("Production schedules a separately authenticated review-only send", async () => {
  const [config, route, sharedRoute] = await Promise.all([
    readFile(`${root}/vercel.json`, "utf8"),
    readFile(scopedRoutePath, "utf8"),
    readFile(sharedRoutePath, "utf8"),
  ]);

  assert.match(config, /"path": "\/api\/workflows\/reviews\/run"/);
  assert.match(route, /isAuthorisedWorkflowCronRequest/);
  assert.match(route, /mode: "send"/);
  assert.match(route, /workflowKey/);
  assert.match(route, /const workflowKey = "post_show_review"/);
  assert.doesNotMatch(route, /runCorporatePaymentHolds|runDailyBookingReview|runReviewManagementWorkflows|runDineplanScheduledEmails/);
  assert.match(sharedRoute, /url\.searchParams\.get\("mode"\) === "send" \? "send" : "dry-run"/);
});

test("review sends claim a booking before contacting the email provider", async () => {
  const [workflow, migration] = await Promise.all([
    readFile(workflowPath, "utf8"),
    readFile(migrationPath, "utf8"),
  ]);

  const claim = workflow.indexOf("claimOneTimeEmailCommunication");
  const send = workflow.indexOf("sendOperationalCustomerEmail", claim);
  assert.ok(claim > 0 && send > claim);
  assert.match(migration, /communications_post_show_review_once_uidx/);
  assert.match(migration, /status in \('sending', 'sent', 'suppressed'\)/);
  assert.match(migration, /type = 'post_show_review'/);
});

test("scoped runs keep durable bounded delivery evidence", async () => {
  const [route, migration] = await Promise.all([
    readFile(scopedRoutePath, "utf8"),
    readFile(migrationPath, "utf8"),
  ]);

  for (const field of [
    "eligible_count",
    "attempted_count",
    "sent_count",
    "skipped_count",
    "failed_count",
    "suppressed_count",
    "deduplicated_count",
  ]) {
    assert.match(migration, new RegExp(field));
  }
  assert.match(route, /execution_mode: "send"/);
  assert.match(route, /status: "running"/);
  assert.match(route, /status: "completed"/);
  assert.match(route, /status: "failed"/);
});
