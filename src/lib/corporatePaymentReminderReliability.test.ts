import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflow = await readFile(
  new URL("./workflows/corporatePaymentHolds.ts", import.meta.url),
  "utf8",
);
const migration = await readFile(
  new URL(
    "../../supabase/migrations/20260928160000_phase_41_2y_p0_b_corporate_reminder_reliability.sql",
    import.meta.url,
  ),
  "utf8",
);
const runner = await readFile(
  new URL("../app/api/workflows/run/route.ts", import.meta.url),
  "utf8",
);
const admin = await readFile(new URL("../app/admin/page.tsx", import.meta.url), "utf8");

test("the configured seven-day hold and one-day reminder policy remain unchanged", () => {
  assert.doesNotMatch(migration, /durationDays/);
  assert.doesNotMatch(migration, /reminderDaysBefore/);
  assert.doesNotMatch(workflow, /48\s*hours|24\s*hours|same-day stage/i);
});

test("the claim remains pre-deadline and safely covers the existing 24-hour window", () => {
  assert.match(migration, /corporate_payment_reminder_at <= clock_timestamp\(\)/);
  assert.match(migration, /corporate_payment_deadline > clock_timestamp\(\)/);
  assert.match(migration, /at time zone 'Africa\/Johannesburg' > clock_timestamp\(\)/);
  assert.doesNotMatch(migration, /date_trunc|::date\s*[<>=]/);
});

test("48 hours is not a new stage while 24-hour and same-day pre-deadline runs remain eligible", () => {
  assert.match(migration, /corporate_payment_reminder_at <= clock_timestamp\(\)/);
  assert.match(migration, /corporate_payment_deadline > clock_timestamp\(\)/);
  assert.match(workflow, /\.gt\("corporate_payment_deadline", now\)/);
});

test("settled, cancelled, expired, protected, refunded, and non-Corporate rows cannot be claimed", () => {
  assert.match(migration, /booking_source = 'corporate-direct'/);
  assert.match(migration, /booking_origin::text = 'corporate'/);
  assert.match(migration, /corporate_payment_expired_at is null/);
  assert.match(migration, /corporate_payment_protected_at is null/);
  assert.match(migration, /payment_status::text = 'pending_payment'/);
  assert.match(migration, /booking_status::text in \('new', 'pending_payment'\)/);
  assert.match(migration, /coalesce\(b\.amount_paid, 0\) <= 0/);
});

test("claims are atomic, concurrent-safe, retryable, and service-role only", () => {
  assert.match(migration, /for update of b skip locked/);
  assert.match(migration, /update public\.bookings b[\s\S]+corporate_payment_reminder_claimed_at = clock_timestamp\(\)/);
  assert.match(migration, /claimed_at < clock_timestamp\(\) - interval '30 minutes'/);
  assert.match(migration, /revoke all[\s\S]+public, anon, authenticated/);
  assert.match(migration, /grant execute[\s\S]+to service_role/);
  assert.match(workflow, /releaseReminderClaims/);
});

test("reminders are claimed and delivered before expiry processing", () => {
  assert.ok(
    workflow.indexOf('"claim_due_corporate_payment_reminders"') <
      workflow.indexOf('"expire_unpaid_corporate_booking"'),
  );
  assert.match(workflow, /\.is\("corporate_payment_reminder_sent_at", null\)/);
});

test("delivery uses the existing branded Zingara mailer with operational content and authenticated booking links", () => {
  assert.match(workflow, /createBrandedCustomerEmail/);
  assert.match(workflow, /sendZingaraEmail/);
  assert.match(workflow, /createZingaraEmailCta\("OPEN BOOKING"/);
  assert.match(workflow, /If EFT\/POP has been received, record it in Zingara/);
  assert.match(workflow, /balance_outstanding/);
  assert.doesNotMatch(workflow, /sendOperationalCustomerEmail/);
});

test("the hourly Production scheduler still invokes the Corporate reminder pathway", () => {
  assert.match(runner, /runCorporatePaymentHolds\(serviceClient\)/);
  assert.match(runner, /process\.env\.CRON_SECRET/);
});

test("Booking Details exposes the deadline and truthful reminder metadata", () => {
  assert.match(admin, /Corporate Payment Hold/);
  assert.match(admin, /Reminder sent:/);
  assert.match(admin, /Reminder scheduled:/);
  assert.match(admin, /timeZone: "Africa\/Johannesburg"/);
});

test("the reminder workflow does not mutate booking entitlement or financial state", () => {
  assert.doesNotMatch(workflow, /\.update\(\{[^}]*amount_paid/);
  assert.doesNotMatch(workflow, /\.update\(\{[^}]*balance_outstanding/);
  assert.doesNotMatch(workflow, /\.update\(\{[^}]*booking_status/);
  assert.doesNotMatch(workflow, /\.update\(\{[^}]*table_id/);
});
