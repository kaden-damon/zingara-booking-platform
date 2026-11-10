import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("expired reservations cannot restart PayFast checkout", async () => {
  const page = await source("../app/find-booking/page.tsx");
  const route = await source("../app/api/find-booking/route.ts");

  assert.match(page, /!result\.booking\.isArchived/);
  assert.match(page, /bookingStatus !== "cancelled"/);
  assert.match(page, /balanceDue > 0/);
  assert.match(route, /isArchived: Boolean\(booking\.archived_at\)/);
});

test("cancelled payment recovery reuses the durable reservation reference", async () => {
  const page = await source("../app/book/page.tsx");
  const findBooking = await source("../app/find-booking/page.tsx");

  assert.match(page, /params\.set\("reference", postPaymentBookingReference\)/);
  assert.match(page, /Check Reservation/);
  assert.doesNotMatch(page, /const retryBookingHref/);
  assert.match(findBooking, /searchParams\.get\("reference"\)/);
});
