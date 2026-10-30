import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("dietary notification resolves Fatima by stable staff id and claims an idempotent delivery", async () => {
  const notification = await source("./dietaryOrderNotification.ts");
  assert.match(notification, /fatimaStaffProfileId = "3ac09b59-fc3f-4c6d-9bb3-8dd47a077188"/);
  assert.match(notification, /\.eq\("id", fatimaStaffProfileId\)/);
  assert.match(notification, /notificationKey: "dietary-order"/);
  assert.match(notification, /eventKey: `\$\{input\.bookingId\}:\$\{input\.confirmationKey\}`/);
  assert.match(notification, /halaalIncrease === 0 && kosherIncrease === 0/);
  assert.match(notification, /completeStaffEmailDelivery/);
});

test("only confirmed booking paths queue the dietary notification", async () => {
  const [bookingRoute, payfastRoute, zeroValueRoute, markPaidRoute] = await Promise.all([
    source("../../app/api/bookings/route.ts"),
    source("../../app/api/payfast/itn/route.ts"),
    source("../../app/api/bookings/complete-zero-value/route.ts"),
    source("../../app/api/admin/bookings/mark-paid/route.ts"),
  ]);
  assert.match(bookingRoute, /!isAwaitingExternalPayment\(booking\)/);
  assert.match(payfastRoute, /if \(!bookingWasConfirmed\)/);
  assert.match(zeroValueRoute, /if \(result\.didTransition\)/);
  assert.match(markPaidRoute, /result\.booking_status === "confirmed"/);
  for (const route of [bookingRoute, payfastRoute, zeroValueRoute, markPaidRoute]) {
    assert.match(route, /notifyConfirmedDietaryOrderByBookingId/);
  }
});
