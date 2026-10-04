import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(
  new URL("./workflows/corporatePaymentHolds.ts", import.meta.url),
  "utf8",
);
const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20261004130000_emergency_corporate_no_auto_expiry.sql",
    import.meta.url,
  ),
  "utf8",
);
const publicHold = readFileSync(
  new URL("./workflows/publicPaymentHolds.ts", import.meta.url),
  "utf8",
);

test("Corporate workflow sends follow-ups without invoking expiry", () => {
  assert.match(workflow, /Corporate Payment Follow-up/);
  assert.match(workflow, /Payment follow-up:/);
  assert.doesNotMatch(workflow, /expire_unpaid_corporate_booking/);
  assert.doesNotMatch(workflow, /before expiry|Expires:/i);
  assert.match(workflow, /corporateAutoExpiryEnabled: false/);
});

test("database compatibility boundary refuses Corporate auto-expiry", () => {
  assert.match(migration, /CORPORATE_AUTO_EXPIRY_DISABLED/);
  assert.match(migration, /'expired', false/);
  assert.doesNotMatch(migration, /set booking_status = 'cancelled'/i);
  assert.doesNotMatch(migration, /update public\.show_tables/i);
  assert.doesNotMatch(migration, /update public\.tickets/i);
  assert.match(migration, /grant execute[\s\S]+to service_role/);
});

test("public Standard payment-hold cleanup remains independent", () => {
  assert.match(publicHold, /expire_due_public_booking_holds/);
  assert.match(publicHold, /publicPaymentHoldMinutes = 30/);
  assert.doesNotMatch(publicHold, /corporate_payment_deadline/);
});

test("Kaden is added only through internal operational mail paths", () => {
  const recipients = readFileSync(
    new URL("./email/internalOperationalRecipients.ts", import.meta.url),
    "utf8",
  );
  const corporateEnquiry = readFileSync(
    new URL("./email/corporateEnquiryEmail.ts", import.meta.url),
    "utf8",
  );
  const customerMailer = readFileSync(
    new URL("./email/smtp.ts", import.meta.url),
    "utf8",
  );

  assert.match(recipients, /kaden@kaden\.co\.za/);
  assert.match(recipients, /staff_profiles/);
  assert.match(recipients, /\.eq\("active", true\)/);
  assert.match(corporateEnquiry, /resolveInternalOperationalRecipients/);
  assert.doesNotMatch(customerMailer, /internalOperationalRecipients|kaden@kaden\.co\.za/);
});

test("Dineplan management routing remains editable and receives Kaden additively", () => {
  assert.match(migration, /dineplan_reconciliation_settings/);
  assert.match(migration, /management_cc_staff_ids/);
  assert.match(migration, /array_append/);
  assert.doesNotMatch(migration, /action_recipient_staff_ids\s*=/);
  assert.doesNotMatch(migration, /corporate_recipient_staff_ids\s*=/);
});
