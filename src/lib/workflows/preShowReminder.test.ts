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

test("pre-show reminder uses the refined mobile-safe attendance and Cape Town layout", async () => {
  const configuration = defaultWorkflowConfigurations.find(
    (item) => item.workflowKey === "pre_show_reminder",
  )!;
  const email = await renderConfiguredWorkflowEmail({
    attendanceLinks: {
      confirmedUrl: "https://book.zingara.co.za/attendance/preview?response=confirmed",
      declinedUrl: "https://book.zingara.co.za/attendance/preview?response=declined",
    },
    booking,
    configuration,
    recipientName: "Kaden",
    show,
    venueSettings,
  });

  assert.match(email.html, />YES - ATTENDING</);
  assert.match(email.html, />NO - NOT ATTENDING</);
  assert.doesNotMatch(email.html, /I&#39;LL BE THERE|CAN&#39;T MAKE IT|YES —|NO —/);
  assert.match(email.html, /Welcome drinks and canapés on arrival\./);
  assert.match(email.html, /Three-course dinner\./);
  assert.match(email.html, /2½-hour performance experience\./);
  assert.doesNotMatch(email.html, /Four-course dinner/);
  assert.match(
    email.html,
    /Additional drinks and gratuity on dinner and drinks are payable on the night\./,
  );
  assert.doesNotMatch(email.html, /outstanding ticket balance/);
  assert.match(email.html, /width="100%" valign="top"/);

  const intro = email.html.indexOf("Please confirm your attendance below");
  const actions = email.html.indexOf("YES - ATTENDING");
  const details = email.html.indexOf("YOUR BOOKING");
  const inclusions = email.html.indexOf("YOUR EXPERIENCE INCLUDES");
  const payment = email.html.indexOf("PAYMENT &amp; GRATUITY");
  const age = email.html.indexOf("AGE RESTRICTION");
  assert.ok(intro > 0 && actions > intro && details > actions);
  assert.ok(inclusions > details && payment > inclusions && age > payment);
});

test("Johannesburg deposit and six-plus wording follows booking financial evidence", async () => {
  const configuration = defaultWorkflowConfigurations.find(
    (item) => item.workflowKey === "pre_show_reminder",
  )!;
  const depositBooking = {
    ...booking,
    balance_outstanding: 3300,
    guest_count: 8,
    payment_status: "deposit_paid",
  };
  const johannesburgShow = {
    ...show,
    date: "2026-12-31",
    id: "show-jhb-nye",
    venue: "johannesburg",
  };
  const email = await renderConfiguredWorkflowEmail({
    booking: depositBooking,
    configuration,
    recipientName: "Kaden",
    show: johannesburgShow,
    venueSettings,
  });

  assert.match(email.html, /Welcome drink on arrival\./);
  assert.match(email.html, /Four-course dinner\./);
  assert.doesNotMatch(email.html, /canapés|Three-course dinner/);
  assert.match(
    email.html,
    /The outstanding ticket balance, additional drinks and gratuity on dinner and drinks are payable on the night\./,
  );
  assert.match(
    email.html,
    /A discretionary 12\.5% gratuity applies to the dinner portion and drinks and will be billed on the night\./,
  );
});

test("New Year's Eve reminder reflects fully paid evidence without adding special payment logic", async () => {
  const configuration = defaultWorkflowConfigurations.find(
    (item) => item.workflowKey === "pre_show_reminder",
  )!;
  const email = await renderConfiguredWorkflowEmail({
    booking: { ...booking, guest_count: 6 },
    configuration,
    recipientName: "Kaden",
    show: { ...show, date: "2026-12-31", venue: "johannesburg" },
    venueSettings,
  });

  assert.match(
    email.html,
    /Additional drinks and gratuity on dinner and drinks are payable on the night\./,
  );
  assert.doesNotMatch(email.html, /outstanding ticket balance/);
  assert.doesNotMatch(email.html, /New Year|upfront|up-front/i);
});

test("Admin preview and Production test delivery use the shared attendance renderer", async () => {
  const [route, admin] = await Promise.all([
    readFile(`${root}/src/app/api/admin/workflows/route.ts`, "utf8"),
    readFile(`${root}/src/app/admin/page.tsx`, "utf8"),
  ]);
  assert.match(route, /getAttendancePreviewLinks\(applicationOrigin\)/);
  assert.match(route, /TEST — Zingara Pre-Show Reminder/);
  assert.match(route, /batch_id: null/);
  assert.match(route, /created_by: null/);
  assert.match(route, /body\.action === "send-test" \? "Kaden" : "Sample Guest"/);
  assert.match(admin, /template\.trigger !== "show-reminder"/);
  assert.match(admin, /template\.trigger !== "post-show-review"/);
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
