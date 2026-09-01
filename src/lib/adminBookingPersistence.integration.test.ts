import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("Admin page persists only the calculated changed booking set", async () => {
  const page = await source("../app/admin/page.tsx");
  const handler = page.slice(
    page.indexOf("function saveBookings(nextBookings"),
    page.indexOf("function saveCorporateRequests", page.indexOf("function saveBookings(nextBookings")),
  );

  assert.match(handler, /planAdminBookingMutations\(bookings, nextBookings\)/);
  assert.match(handler, /persistBookings\(changedBookings, \{ createReferences \}\)/);
  assert.doesNotMatch(handler, /persistBookings\(nextBookings/);
  assert.doesNotMatch(handler, /nextBookings\.map\(.*upsertCustomerFromInfo/s);
});

test("ordinary edits cannot touch payment, ticket, or communication domains", async () => {
  const page = await source("../app/admin/page.tsx");
  const handler = page.slice(
    page.indexOf("function saveBookings(nextBookings"),
    page.indexOf("function saveCorporateRequests", page.indexOf("function saveBookings(nextBookings")),
  );

  assert.match(handler, /mutation\.paymentChanged/);
  assert.match(handler, /mutation\.ticketChanged/);
  assert.match(handler, /mutation\.communicationChanged/);
});

test("targeted state updates enforce active staff and booking permission", async () => {
  const route = await source("../app/api/admin/bookings/route.ts");
  const handler = route.slice(
    route.indexOf("async function persistBookingStateUpdate"),
    route.indexOf("async function setBookingArchiveState"),
  );

  assert.match(handler, /requireActiveStaff\(request\)/);
  assert.match(handler, /rolePermissions\[role\]\.includes\("bookings:manage"\)/);
  assert.doesNotMatch(handler, /from\("payments"\)|from\("tickets"\)|from\("communications"\)/);
});

test("cancellation and table mutations retain their dedicated paths", async () => {
  const route = await source("../app/api/admin/bookings/route.ts");

  assert.match(route, /body\.action === "cancel"/);
  assert.match(route, /cancel_booking_atomic/);
  assert.match(route, /body\.action === "map-physical-table"/);
  assert.match(route, /map_booking_operational_table_atomic/);
});
