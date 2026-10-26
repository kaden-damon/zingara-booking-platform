import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  defaultWorkflowConfigurations,
  getPreShowReminderDueAt,
  isWithinPreShowReminderWindow,
  preShowReminderDeliveryWindowMs,
  renderConfiguredWorkflowEmail,
} from "./automatedWorkflows.ts";
import {
  defaultVenueSettings,
  normalizeVenueSettings,
} from "../zingaraDemo.ts";

const root = process.cwd();

const show = {
  date: "2026-11-04",
  id: "show-preview",
  name: "The Royal Countess",
  status: "active",
  time: "18:00:00",
  venue: "cape-town",
};

const booking = {
  amount_paid: 5500,
  archived_at: null,
  balance_outstanding: 0,
  booking_reference: "ZNG-PREVIEW",
  booking_status: "confirmed",
  customer_id: "customer-preview",
  guest_count: 4,
  id: "booking-preview",
  payment_status: "fully_paid",
  section: "Golden Circle",
  show_id: show.id,
  table_id: null,
  total_amount: 5500,
};

const venueSettings = normalizeVenueSettings({
  ...defaultVenueSettings,
  operationalSettings: {
    ...defaultVenueSettings.operationalSettings,
    customerExperienceTimes: {
      ...defaultVenueSettings.operationalSettings.customerExperienceTimes,
      "cape-town": {
        groundsOpen: "16:45",
        guestSeating: "18:15",
        showStarts: "19:45",
      },
    },
  },
});

test("pre-show reminder is due exactly 24 hours before authoritative Show Starts", () => {
  const dueAt = getPreShowReminderDueAt(show, venueSettings);

  assert.equal(dueAt?.toISOString(), "2026-11-03T17:45:00.000Z");
  assert.equal(isWithinPreShowReminderWindow(dueAt!, dueAt!), true);
  assert.equal(
    isWithinPreShowReminderWindow(
      dueAt!,
      new Date(dueAt!.getTime() + preShowReminderDeliveryWindowMs - 1),
    ),
    true,
  );
  assert.equal(
    isWithinPreShowReminderWindow(
      dueAt!,
      new Date(dueAt!.getTime() + preShowReminderDeliveryWindowMs),
    ),
    false,
  );
  assert.equal(
    isWithinPreShowReminderWindow(dueAt!, new Date(dueAt!.getTime() - 1)),
    false,
  );
});

test("reminder renders every required field from authoritative venue settings", async () => {
  const configuration = defaultWorkflowConfigurations.find(
    (item) => item.workflowKey === "pre_show_reminder",
  )!;
  const email = await renderConfiguredWorkflowEmail({
    booking,
    configuration,
    recipientName: "Kaden",
    show,
    venueSettings,
  });

  assert.match(email.message, /Performance date: 2026\/11\/04/);
  assert.match(email.message, /City and venue: Cape Town — The Night Court/);
  assert.match(email.message, /Guests: 4/);
  assert.match(email.message, /Seating zone: Golden Circle/);
  assert.match(email.message, /Grounds Open: 16:45/);
  assert.match(email.message, /Guest Seating: 18:15/);
  assert.match(email.message, /Show Starts: 19:45/);
  assert.match(email.message, /Booking reference: ZNG-PREVIEW/);
  assert.match(email.message, /\/ticket\/ZNG-PREVIEW/);
  assert.doesNotMatch(email.message, /Show Starts: 18:00/);
  assert.match(email.html, /data-zingara-customer-email="true"/);
});

test("Production reminder scheduling is live, atomic and fails closed", async () => {
  const [workflow, migration, vercel] = await Promise.all([
    readFile(`${root}/src/lib/workflows/automatedWorkflows.ts`, "utf8"),
    readFile(
      `${root}/supabase/migrations/20261026120000_phase_52_1_pre_show_reminders.sql`,
      "utf8",
    ),
    readFile(`${root}/vercel.json`, "utf8"),
  ]);

  assert.match(
    vercel,
    /\/api\/workflows\/run\?mode=send&workflow=pre_show_reminder/,
  );
  assert.match(migration, /communications_show_reminder_once_uidx/);
  assert.match(migration, /status in \('sending', 'sent', 'suppressed'\)/);
  assert.match(migration, /timing_offset_days = 1/);
  assert.match(migration, /activated_at = now\(\)/);
  assert.match(workflow, /booking\.booking_status !== "confirmed"/);
  assert.match(workflow, /\["deposit_paid", "fully_paid", "comp_vip"\]/);
  assert.match(workflow, /reminderDueAt < activationDate/);

  const claim = workflow.indexOf(
    "const deliveryClaim = await claimOneTimeEmailCommunication",
  );
  const send = workflow.indexOf("sendOperationalCustomerEmail", claim);
  assert.ok(claim > 0 && send > claim);
});
