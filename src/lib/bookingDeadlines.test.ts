import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  calculateCorporatePaymentDeadline,
  getCorporatePaymentHoldStatus,
  getPublicBookingCutoff,
} from "./bookingDeadlines.ts";
function createSettings() {
  return {
    operationalSettings: {
      publicBookings: {
        "cape-town": {
          enabled: true,
          opensAt: null,
          sameDayCutoffEnabled: true,
          sameDayCutoffTime: "12:00",
        },
        johannesburg: {
          enabled: true,
          opensAt: null,
          sameDayCutoffEnabled: true,
          sameDayCutoffTime: "12:00",
        },
      },
    },
  } as unknown as {
    operationalSettings: {
      publicBookings: Record<
        "cape-town" | "johannesburg",
        {
          enabled: boolean;
          opensAt: null;
          sameDayCutoffEnabled: boolean;
          sameDayCutoffTime: string;
        }
      >;
    };
  };
}

const settings = createSettings();

test("public booking remains open immediately before the 12:00 SAST cutoff", () => {
  assert.equal(
    getPublicBookingCutoff({
      date: "2026-09-02",
      location: "cape-town",
      now: new Date("2026-09-02T09:59:59.999Z"),
      settings,
    }).closed,
    false,
  );
});

test("public booking closes exactly at the 12:00 SAST cutoff", () => {
  assert.equal(
    getPublicBookingCutoff({
      date: "2026-09-02",
      location: "johannesburg",
      now: new Date("2026-09-02T10:00:00.000Z"),
      settings,
    }).closed,
    true,
  );
});

test("future shows remain available", () => {
  assert.equal(
    getPublicBookingCutoff({
      date: "2026-09-03",
      location: "johannesburg",
      now: new Date("2026-09-02T18:00:00.000Z"),
      settings,
    }).closed,
    false,
  );
});

test("disabled cutoff does not close same-day bookings", () => {
  const disabled = createSettings();
  disabled.operationalSettings.publicBookings.johannesburg.sameDayCutoffEnabled = false;
  assert.equal(
    getPublicBookingCutoff({
      date: "2026-09-02",
      location: "johannesburg",
      now: new Date("2026-09-02T18:00:00.000Z"),
      settings: disabled as never,
    }).closed,
    false,
  );
});

test("Corporate deadline uses the configured duration for a later show", () => {
  assert.deepEqual(
    calculateCorporatePaymentDeadline({
      createdAt: new Date("2026-09-01T08:00:00.000Z"),
      durationDays: 7,
      reminderDaysBefore: 1,
      showDate: "2026-09-30",
      showTime: "18:00",
    }),
    {
      deadline: "2026-09-08T08:00:00.000Z",
      reminderAt: "2026-09-07T08:00:00.000Z",
    },
  );
});

test("Corporate deadline never passes show start", () => {
  assert.equal(
    calculateCorporatePaymentDeadline({
      createdAt: new Date("2026-09-01T08:00:00.000Z"),
      durationDays: 7,
      reminderDaysBefore: 1,
      showDate: "2026-09-02",
      showTime: "18:00",
    }).deadline,
    "2026-09-02T16:00:00.000Z",
  );
});

test("any booking-applied payment protects a Corporate hold", () => {
  assert.equal(
    getCorporatePaymentHoldStatus({
      amountPaid: 1,
      deadline: "2026-09-01T00:00:00.000Z",
      now: new Date("2026-09-02T00:00:00.000Z"),
    }),
    "payment-received",
  );
});

test("unpaid booking becomes expired after its deadline", () => {
  assert.equal(
    getCorporatePaymentHoldStatus({
      amountPaid: 0,
      deadline: "2026-09-01T00:00:00.000Z",
      now: new Date("2026-09-02T00:00:00.000Z"),
    }),
    "expired",
  );
});

test("public API cutoff guard precedes customer mutation and exempts staff", async () => {
  const source = await readFile(
    new URL("../app/api/bookings/route.ts", import.meta.url),
    "utf8",
  );
  const guard = source.indexOf("PUBLIC_BOOKING_CUTOFF_REACHED");
  const mutation = source.indexOf("const customerId = await upsertCustomer");
  assert.ok(guard > 0 && mutation > guard);
  assert.match(source, /booking\.source === "online" && !isTrustedStaff/);
});

test("Corporate hold migration is prospective, service-role-only, and atomic", async () => {
  const sql = await readFile(
    new URL(
      "../../supabase/migrations/20260902150000_phase_39_48_booking_cutoff_corporate_holds.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(sql, /before insert on public\.bookings/);
  assert.doesNotMatch(sql, /update public\.bookings\s+set corporate_payment_deadline/i);
  assert.match(sql, /coalesce\(v_booking\.amount_paid, 0\) > 0/);
  assert.match(sql, /update public\.show_tables set booking_id = null/);
  assert.match(sql, /grant execute on function public\.expire_unpaid_corporate_booking\(uuid\) to service_role/);
  assert.ok(sql.indexOf("revoke all") < sql.indexOf("authenticated"));
});

test("payment reminders are grouped by creator and do not use customer email", async () => {
  const source = await readFile(
    new URL("./workflows/corporatePaymentHolds.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /groups = new Map/);
  assert.match(source, /to: staff\.staff_email/);
  assert.doesNotMatch(source, /sendOperationalCustomerEmail/);
  assert.match(source, /corporate_payment_reminder_sent_at/);
});

test("existing payment-link and ticket routes are not guarded by the cutoff", async () => {
  const [paymentLink, ticket] = await Promise.all([
    readFile(
      new URL("../app/api/payment-links/[token]/checkout/route.ts", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../app/ticket/[reference]/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(paymentLink, /PUBLIC_BOOKING_CUTOFF_REACHED/);
  assert.doesNotMatch(ticket, /PUBLIC_BOOKING_CUTOFF_REACHED/);
});
