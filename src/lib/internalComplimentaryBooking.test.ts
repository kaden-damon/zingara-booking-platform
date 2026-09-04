import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  applyAuthoritativeComplimentaryBooking,
  isComplimentaryBooking,
} from "./internalComplimentaryBooking.ts";
import type { DemoBooking } from "./zingaraDemo.ts";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

function booking(): DemoBooking {
  return {
    addons: [{ id: "addon", name: "Addon", price: 100 }],
    addonsTotal: 100,
    agreedPriceSource: "complimentary",
    amountPaid: 0,
    balanceDue: 4100,
    bookingDate: "2026-10-17 17:00",
    communicationHistory: [],
    createdAt: "2026-09-03T10:00:00.000Z",
    customer: {
      email: "guest@example.com",
      name: "Test Guest",
      phone: "+27110000000",
    },
    discountAmount: 50,
    partySize: 4,
    paymentOption: "deposit",
    paymentStatus: "pending-payment",
    pricePerPerson: 1000,
    promoCode: "TEST",
    reference: "ZNG-COMP01",
    serviceFeeAmount: 50,
    showId: "show-1",
    status: "pending-payment",
    subtotalPrice: 4100,
    tableId: "",
    tableNumber: "",
    totalPrice: 4100,
    zoneId: "middle-ring",
    zoneTitle: "Middle Ring",
  };
}

test("authoritative complimentary state is settled at R0 without fake payment", () => {
  const result = applyAuthoritativeComplimentaryBooking({
    booking: booking(),
    createdAt: "2026-09-03T11:00:00.000Z",
    staffProfileId: "staff-1",
  });

  assert.equal(result.totalPrice, 0);
  assert.equal(result.pricePerPerson, 0);
  assert.equal(result.serviceFeeAmount, 0);
  assert.equal(result.amountPaid, 0);
  assert.equal(result.balanceDue, 0);
  assert.equal(result.paymentStatus, "comp-vip");
  assert.equal(result.status, "confirmed");
  assert.equal(result.agreedPriceSource, "complimentary");
  assert.equal(result.pricingProvenance?.authorizedByStaffId, "staff-1");
  assert.equal(result.promoCode, undefined);
  assert.equal(result.communicationHistory[0]?.trigger, "complimentary-booking");
  assert.match(result.lifecycleHistory?.[0]?.note ?? "", /R0 obligation/);
});

test("complimentary identity is explicit and does not classify standard pricing", () => {
  assert.equal(isComplimentaryBooking(booking()), true);
  assert.equal(
    isComplimentaryBooking({ agreedPriceSource: "standard-zone" }),
    false,
  );
});

test("booking route requires trusted staff and skips payment persistence", async () => {
  const route = await source("../app/api/bookings/route.ts");
  assert.match(route, /isComplimentaryBooking\(booking\) && !isTrustedStaff/);
  assert.match(route, /applyAuthoritativeComplimentaryBooking/);
  assert.match(
    route,
    /const paymentId = isComplimentaryBooking\(booking\)[\s\S]*?undefined[\s\S]*?: await upsertPayment/,
  );
});

test("staff UI exposes comp controls and bypasses PayFast completion", async () => {
  const page = await source("../app/book/page.tsx");
  assert.match(page, /Complimentary Booking/);
  assert.match(page, /setStaffPricingMode\("complimentary"\)/);
  assert.match(page, /No payment option, Booking Fee, payment link or PayFast checkout applies/);
  assert.match(page, /if \(isComplimentary\) \{[\s\S]*?setBookingReference/);
  assert.match(page, /permissions\?\.includes\("bookings:manage"\)/);
});

test("public UI cannot enter complimentary mode", async () => {
  const page = await source("../app/book/page.tsx");
  assert.match(page, /\{manualCheckoutRole !== "none" && \(/);
  assert.match(
    page,
    /manualCheckoutRole !== "none" && staffPricingMode === "complimentary"/,
  );
});

test("complimentary booking keeps normal capacity validation and ticket flow", async () => {
  const route = await source("../app/api/bookings/route.ts");
  const capacityIndex = route.indexOf("validateBookingCapacityIncrease");
  const reservationIndex = route.indexOf(
    "const reservation = await reservePublicBookingAtomically",
  );
  const bookingIndex = route.indexOf("const bookingId = await upsertBooking");
  const ticketIndexes = [...route.matchAll(/await upsertTicket/g)].map(
    (match) => match.index,
  );
  assert.ok(capacityIndex > 0 && capacityIndex < reservationIndex);
  assert.ok(capacityIndex < bookingIndex);
  assert.equal(ticketIndexes.length, 2);
  assert.ok(ticketIndexes.some((index) => index > reservationIndex));
  assert.ok(ticketIndexes.some((index) => index > bookingIndex));
  assert.doesNotMatch(route, /isComplimentaryBooking\(booking\)[\s\S]{0,160}capacity.*bypass/i);
});
