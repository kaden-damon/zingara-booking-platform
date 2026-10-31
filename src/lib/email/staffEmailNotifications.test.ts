import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { staffEmailNotificationRegistry } from "./staffEmailNotifications.ts";

test("personal subscriptions and management routing are separate", () => {
  assert.deepEqual(
    staffEmailNotificationRegistry.map(({ key, mode }) => ({ key, mode })),
    [
      { key: "daily-booking-review", mode: "personal" },
      { key: "secret-guest-list", mode: "personal" },
      { key: "new-waitlist-enquiry", mode: "personal" },
      { key: "daily-waitlist-reminder", mode: "personal" },
      { key: "corporate-enquiry", mode: "management" },
      { key: "new-review-alert", mode: "management" },
      { key: "invoice-request-reminders", mode: "management" },
    ],
  );
});

test("Secret Guest List uses authoritative routing plus each recipient's own preference", async () => {
  const [migration, workflow] = await Promise.all([
    readFile(
      new URL(
        "../../../supabase/migrations/20261030210000_phase_67_secret_guest_list.sql",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(new URL("./secretGuestListEmail.ts", import.meta.url), "utf8"),
  ]);

  for (const id of [
    "bb58fd74-5995-4544-803a-6baaf0ec129b",
    "92edf75d-06bf-4d40-a142-52b2862a3795",
    "3ac09b59-fc3f-4c6d-9bb3-8dd47a077188",
    "d185b639-054d-4c4f-8f6b-3c1e6fc205af",
    "fe8dff17-a040-4296-afa1-49c058d070f4",
    "e8598359-54a0-4e1f-a635-1ec8ae02cb78",
    "a021d26b-3a16-46b5-b184-6f33e58d1884",
    "eb6ce1ab-50c8-415a-a858-23ad58300ad8",
  ]) {
    assert.match(migration, new RegExp(id));
  }
  assert.match(workflow, /loadManagementEmailRoute\(supabase, notificationKey\)/);
  assert.match(workflow, /isPersonalEmailSubscriptionEnabled/);
  assert.match(workflow, /toEnabled\.filter/);
  assert.match(workflow, /ccEnabled\.filter/);
  assert.match(workflow, /createBrandedCustomerEmail/);
  assert.match(workflow, /insertCommunicationPayload/);
  assert.match(workflow, /OPEN WAITLIST ENTRY/);
  assert.doesNotMatch(workflow, /@zingara\.co\.za|@kaden\.co\.za/);
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
