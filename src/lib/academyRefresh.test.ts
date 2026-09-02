import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const admin = readFileSync(
  new URL("../app/admin/page.tsx", import.meta.url),
  "utf8",
);
const booking = readFileSync(
  new URL("../app/book/page.tsx", import.meta.url),
  "utf8",
);

const originalAcademyModuleIds = [
  "getting-started",
  "bookings",
  "find-my-booking",
  "corporate-bookings",
  "crm-guests",
  "waitlist",
  "communications",
  "tickets-check-in",
  "venue-operations",
  "staff-permissions",
  "settings",
  "analytics-reporting",
  "platform-administration",
  "faq",
];

test("calendar checkout keeps the location pill in normal flow below the lock banner", () => {
  assert.match(
    booking,
    /isLockedCalendarCheckout\s*\? "mb-8 flex justify-start sm:mb-10"\s*: "-mt-5 mb-8 flex justify-start sm:-mt-10 sm:mb-10"/,
  );
});

test("existing Academy modules and personal history keys remain intact", () => {
  for (const moduleId of originalAcademyModuleIds) {
    assert.match(admin, new RegExp(`id: "${moduleId.replaceAll("-", "\\-")}"`));
  }

  assert.match(admin, /favourites: "zingara-academy-favourites"/);
  assert.match(admin, /read: "zingara-academy-read"/);
  assert.match(admin, /recent: "zingara-academy-recent"/);
});

test("new live workflows use distinct lesson IDs without replacing existing lessons", () => {
  for (const lessonId of [
    "staff-calendar-booking-creation",
    "manual-checkout-payment-links",
    "moving-bookings-between-shows",
    "temporary-table-custom-pricing",
    "system-maintenance-mode",
  ]) {
    assert.equal(admin.split(`id: "${lessonId}"`).length - 1, 1);
  }

  assert.equal(admin.split('id: "creating-a-booking"').length - 1, 1);
  assert.equal(
    admin.split('id: "booking-locking-and-read-only-mode"').length - 1,
    1,
  );
});

test("Academy covers current staff booking creation and locking behavior", () => {
  assert.match(admin, /use \+ on an Admin show card/i);
  assert.match(admin, /Standard Booking or Corporate Booking/);
  assert.match(admin, /Show Currently In Use/);
  assert.match(admin, /public customers can continue booking normally/);
  assert.match(admin, /Use Cancel to leave the flow and release your lock immediately/);
});

test("Academy covers payment links, pricing, and amendment protections", () => {
  assert.match(admin, /SEND PAYMENT LINK/);
  assert.match(admin, /COPY LINK/);
  assert.match(admin, /same booking/);
  assert.match(admin, /There is no group discount, demand pricing, or low-availability uplift/);
  assert.match(admin, /Moving a Booking to Another Show/);
  assert.match(admin, /payment history and agreed financial obligation do not change silently/);
});

test("Academy covers Floor, CRM, tickets, sales gating, and maintenance", () => {
  assert.match(admin, /Temporary-Table Custom Pricing/);
  assert.match(admin, /Floor Assignment Queue/);
  assert.match(admin, /Email and Push may be paused independently/);
  assert.match(admin, /Apple Wallet uses the same ticket QR identity/);
  assert.match(admin, /public Cape Town sales are scheduled to open on 9 September 2026/);
  assert.match(admin, /BOOKINGS, PAYMENTS, or FULL BOOKING JOURNEY/);
  assert.match(admin, /System > Operations/);
  assert.match(admin, /System > Issues/);
  assert.match(admin, /System > Preferences/);
});
