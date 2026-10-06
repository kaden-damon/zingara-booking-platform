import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(new URL("./workflows/dailyBookingReview.ts", import.meta.url), "utf8");
const runner = readFileSync(new URL("../app/api/workflows/run/route.ts", import.meta.url), "utf8");
const route = readFileSync(new URL("../app/api/admin/workflows/daily-booking-review/route.ts", import.meta.url), "utf8");
const card = readFileSync(new URL("../app/admin/DailyBookingReviewWorkflowCard.tsx", import.meta.url), "utf8");
const admin = readFileSync(new URL("../app/admin/page.tsx", import.meta.url), "utf8");
const quickStart = readFileSync(new URL("../app/admin/quick-start/page.tsx", import.meta.url), "utf8");
const migration = readFileSync(new URL("../../supabase/migrations/20261005074000_phase_46_daily_booking_review.sql", import.meta.url), "utf8");

test("the existing authenticated scheduler runs the separate daily workflow", () => {
  assert.match(runner, /runDailyBookingReview\(serviceClient\)/);
  assert.match(runner, /process\.env\.CRON_SECRET/);
  assert.match(workflow, /daily_booking_review_configuration/);
});

test("the default schedule is 08:00 SAST and activation cannot replay a missed morning", () => {
  assert.match(migration, /default '08:00:00'/);
  assert.match(workflow, /Africa\/Johannesburg/);
  assert.match(workflow, /activated-after-schedule/);
  assert.match(workflow, /currentMinute < scheduledMinute \|\| currentMinute >= scheduledMinute \+ 60/);
});

test("original creator attribution and active role permission are authoritative", () => {
  assert.match(workflow, /\.eq\("created_by_staff_id", staffId\)/);
  assert.match(workflow, /permission\?\.key === "bookings:manage"/);
  assert.match(workflow, /\.eq\("active", true\)/);
  assert.doesNotMatch(workflow, /updated_by_staff_id|last_edited_by/);
});

test("current booking, payment, show and table state are resolved at generation time", () => {
  assert.match(workflow, /from\("bookings"\)/);
  assert.match(workflow, /from\("shows"\)/);
  assert.match(workflow, /from\("show_tables"\)/);
  assert.match(workflow, /balance_outstanding/);
  assert.match(workflow, /Payment, seating and booking status are refreshed/);
});

test("large creator portfolios hydrate related records in bounded batches", () => {
  assert.match(workflow, /for \(const batch of chunks\(showIds\)\)/);
  assert.match(workflow, /for \(const batch of chunks\(customerIds\)\)/);
  assert.match(workflow, /for \(const batch of chunks\(replacementIds\)\)/);
  assert.match(workflow, /for \(const batch of chunks\(candidateIds\)\)/);
});

test("moved, cancelled, duplicate and authoritative replacement states are explicit", () => {
  assert.match(workflow, /booking\.show-transfer/);
  assert.match(workflow, /Cancelled record/);
  assert.match(workflow, /duplicate_booking_review_dispositions/);
  assert.match(workflow, /public_checkout_superseded_by/);
  assert.match(workflow, /Replaced by/);
});

test("historical dispositions cannot look like current bookings needing a table", () => {
  assert.match(workflow, /historicalDisposition/);
  assert.match(workflow, /\["cancelled", "refunded"\]/);
  assert.match(workflow, /historicalDisposition\s*\? "Not required"/);
  assert.match(workflow, /booking\.booking_status === "cancelled"[\s\S]*"Cancelled record"/);
  assert.match(workflow, /booking\.booking_status === "refunded"[\s\S]*"Refunded record"/);
});

test("Corporate outstanding balances use follow-up semantics rather than expiry warnings", () => {
  assert.match(workflow, /Payment follow-up due/);
  assert.match(workflow, /corporate_payment_deadline/);
  assert.doesNotMatch(workflow, /Corporate.*expire|expiry warning/i);
});

test("delivery is one staff report per SAST date and failed sends remain retryable", () => {
  assert.match(migration, /unique \(staff_profile_id, report_date\)/);
  assert.match(migration, /where daily_booking_review_deliveries\.status = 'failed'/);
  assert.match(migration, /status in \('claimed', 'sent', 'failed', 'skipped'\)/);
  assert.match(workflow, /claim_daily_booking_review_delivery/);
  assert.match(workflow, /complete_daily_booking_review_delivery/);
});

test("non-empty staff reports use the branded mailer and Kaden management copy", () => {
  assert.match(workflow, /createBrandedCustomerEmail/);
  assert.match(workflow, /sendZingaraEmail/);
  assert.match(workflow, /resolveInternalOperationalRecipients/);
  assert.match(workflow, /kadenManagementEmail/);
  assert.match(card, /kaden@kaden\.co\.za/);
});

test("empty reports are recorded as skipped before the mailer is reached", () => {
  const skipIndex = workflow.indexOf('if (!report.items.length)');
  const sendIndex = workflow.indexOf("sendZingaraEmail({", skipIndex);
  assert.ok(skipIndex > 0);
  assert.ok(sendIndex > skipIndex);
  assert.match(workflow.slice(skipIndex, sendIndex), /p_status: "skipped"/);
  assert.match(card, /No email/);
});

test("preview is read-only and exposes recipient, counts and management CC", () => {
  assert.match(route, /export async function GET/);
  assert.doesNotMatch(route, /sendZingaraEmail/);
  assert.match(card, /Staff recipient/);
  assert.match(card, /Needs attention/);
  assert.match(card, /Preview Email/);
  assert.match(card, /No-send preview/);
});

test("staff links remain authenticated Admin links and sensitive ticket or review material is absent", () => {
  assert.match(workflow, /\/admin\?section=bookings&booking=/);
  assert.doesNotMatch(workflow, /ticket.*token|review.*token|qr_code|provider_secret/i);
  assert.match(route, /requireActiveStaff/);
  assert.match(route, /super-admin/);
});

test("the workflow is documented in Automated Workflows, Quick Start and Academy", () => {
  assert.match(admin, /DailyBookingReviewWorkflowCard/);
  assert.match(admin, /id: "daily-booking-review"/);
  assert.match(quickStart, /Daily Booking Review/);
  assert.match(quickStart, /Moved, cancelled or replaced bookings show their latest disposition/);
});

test("the workflow never mutates booking, payment, ticket, table or capacity records", () => {
  assert.doesNotMatch(workflow, /from\("bookings"\)\s*\.update/);
  assert.doesNotMatch(workflow, /from\("show_tables"\)\s*\.update/);
  assert.doesNotMatch(workflow, /from\("tickets"\)\s*\.(?:insert|update|delete)/);
  assert.doesNotMatch(workflow, /capacity.*(?:insert|update)/i);
  assert.doesNotMatch(workflow, /sendOperationalCustomerEmail/);
});
