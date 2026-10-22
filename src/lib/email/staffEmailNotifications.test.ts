import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { staffEmailNotificationRegistry } from "./staffEmailNotifications.ts";

test("personal subscriptions and management routing are separate", () => {
  assert.deepEqual(
    staffEmailNotificationRegistry.map(({ key, mode }) => ({ key, mode })),
    [
      { key: "daily-booking-review", mode: "personal" },
      { key: "corporate-enquiry", mode: "management" },
      { key: "new-review-alert", mode: "management" },
      { key: "invoice-request-reminders", mode: "management" },
    ],
  );
});

test("Corporate enquiry routing uses staff identities and durable delivery evidence", async () => {
  const [migration, workflow] = await Promise.all([
    readFile(
      new URL(
        "../../../supabase/migrations/20261015130000_phase_49_2_staff_email_notifications.sql",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(new URL("./corporateEnquiryEmail.ts", import.meta.url), "utf8"),
  ]);

  assert.match(migration, /lower\(email\) = 'lisa@zingara\.co\.za'/);
  assert.match(migration, /lower\(email\) = 'kaden@kaden\.co\.za'/);
  assert.match(migration, /array\[v_lisa\]/);
  assert.match(migration, /array\[v_kaden\]/);
  assert.match(migration, /unique \(notification_key, event_key\)/);
  assert.match(migration, /status = 'failed'/);
  assert.doesNotMatch(migration, /status = 'sent'[\s\S]*status = 'processing'/);
  assert.match(workflow, /loadManagementEmailRoute\(supabase, "corporate-enquiry"\)/);
  assert.match(workflow, /claimStaffEmailDelivery/);
  assert.match(workflow, /completeStaffEmailDelivery/);
  assert.doesNotMatch(workflow, /lisa@zingara\.co\.za|kaden@kaden\.co\.za/);
});

test("settings endpoint enforces self-service and management-only routing", async () => {
  const route = await readFile(
    new URL(
      "../../app/api/admin/email-notifications/route.ts",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(route, /staff_profile_id: auth\.staffProfile\.id/);
  assert.match(route, /permissionsOf\(staffProfile\)\.includes\("settings:manage"\)/);
  assert.match(route, /Management access is required to change email routing/);
  assert.match(route, /Every recipient must be an active staff member/);
  assert.doesNotMatch(route, /body\.staffProfileId/);
});

test("daily booking email honours a staff member's own subscription without global hydration", async () => {
  const workflow = await readFile(
    new URL("../workflows/dailyBookingReview.ts", import.meta.url),
    "utf8",
  );

  assert.match(workflow, /staff_email_subscriptions/);
  assert.match(workflow, /daily-booking-review/);
  assert.match(workflow, /eligible\.filter\(\(staff\) => !disabled\.has\(staff\.id\)\)/);
  assert.doesNotMatch(workflow, /select\("\*"\)/);
});

test("Email Notifications UI keeps personal and management controls distinct", async () => {
  const card = await readFile(
    new URL("../../app/admin/EmailNotificationsSettings.tsx", import.meta.url),
    "utf8",
  );

  assert.match(card, /Your email subscriptions/);
  assert.match(card, /Management-controlled recipients/);
  assert.match(card, /Only authorised management/);
  assert.match(card, /New Corporate Enquiries/);
  assert.match(card, /New Review Alerts/);
  assert.match(card, /Invoice Request Reminders/);
  assert.match(card, /sm:grid-cols-2/);
});
