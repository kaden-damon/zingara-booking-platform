import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  bookingMatchesPromoFilter,
  getPersistedBookingPromoCode,
  getPersistedPromoDiscountLabel,
  getPersistedPromoFilterOptions,
} from "./bookingPromoUsage.ts";
import type { DemoBooking } from "./zingaraDemo.ts";

function booking(
  reference: string,
  code?: string,
  discountAmount = 0,
  subtotalAmount = 0,
) {
  return {
    promoRedemption: code
      ? {
          code,
          discountAmount,
          redeemedAt: "2026-09-01T10:00:00.000Z",
          subtotalAmount,
        }
      : undefined,
    reference,
  } as DemoBooking;
}

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("persisted promo search normalizes historical codes independently of library state", () => {
  const historical = booking("ZNG-HIST01", " countess10 ");

  assert.equal(getPersistedBookingPromoCode(historical), "COUNTESS10");
  assert.equal(bookingMatchesPromoFilter(historical, "COUNTESS10"), true);
  assert.equal(bookingMatchesPromoFilter(historical, "countess10"), true);
  assert.equal(bookingMatchesPromoFilter(historical, "none"), false);
});

test("promo filter supports All Promo Codes and No Promo Code", () => {
  const withPromo = booking("ZNG-PROMO1", "COUNTESS10");
  const withoutPromo = booking("ZNG-NONE01");

  assert.equal(bookingMatchesPromoFilter(withPromo, "all"), true);
  assert.equal(bookingMatchesPromoFilter(withoutPromo, "all"), true);
  assert.equal(bookingMatchesPromoFilter(withPromo, "none"), false);
  assert.equal(bookingMatchesPromoFilter(withoutPromo, "none"), true);
});

test("promo options come only from persisted booking usage", () => {
  assert.deepEqual(
    getPersistedPromoFilterOptions([
      booking("ZNG-3", "STAGE15"),
      booking("ZNG-1", "COUNTESS10"),
      booking("ZNG-2", "countess10"),
      booking("ZNG-4"),
    ]),
    ["COUNTESS10", "STAGE15"],
  );
});

test("discount display is derived from persisted financial evidence", () => {
  const persisted = booking("ZNG-DISC01", "COUNTESS10", 337.62, 3376.2);

  assert.equal(getPersistedPromoDiscountLabel(persisted), "10% effective");
});

test("COUNTESS10 acceptance cohort returns all 59 persisted redemptions", () => {
  const cohort = Array.from({ length: 59 }, (_, index) =>
    booking(`ZNG-C10-${index + 1}`, "COUNTESS10", 100, 1000),
  );
  const bookings = [...cohort, booking("ZNG-NOPROMO")];

  assert.equal(
    bookings.filter((item) => bookingMatchesPromoFilter(item, "COUNTESS10"))
      .length,
    59,
  );
});

test("Admin hydrates promo evidence once and applies one cohort to every booking view", async () => {
  const [page, route] = await Promise.all([
    source("../app/admin/page.tsx"),
    source("../app/api/admin/bookings/route.ts"),
  ]);

  assert.match(route, /requireActiveStaff\(request\)/);
  assert.match(route, /"promo_redemptions"/);
  assert.match(route, /promo_code:promo_codes\(code\)/);
  assert.match(page, /getPersistedBookingPromoCode\(booking\)/);
  assert.match(page, /bookingMatchesPromoFilter\(booking, bookingPromoFilter\)/);
  assert.match(page, /const filteredBookings = useMemo/);
  assert.match(page, /filteredBookings\.map\(getCompactBookingRow\)/);
  assert.match(page, /paginatedBookings\.map\(getCompactBookingRow\)/);
  assert.match(page, /All Promo Codes/);
  assert.match(page, /No Promo Code/);
});

test("Compact and Booking Details expose persisted promo evidence", async () => {
  const page = await source("../app/admin/page.tsx");

  assert.match(page, /sourceLabel: promoCode \? `\$\{baseSourceLabel\} · \$\{promoCode\}`/);
  assert.match(page, /booking\.promoRedemption\.code/);
  assert.match(page, /getPersistedPromoDiscountLabel\(booking\)/);
  assert.match(page, /booking\.promoRedemption\.discountAmount/);
});
