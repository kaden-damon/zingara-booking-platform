import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const protectedReadRoutes = [
  "../app/api/admin/booking-lifecycle-events/route.ts",
  "../app/api/admin/bookings/route.ts",
  "../app/api/admin/communication-templates/route.ts",
  "../app/api/admin/communications/route.ts",
  "../app/api/admin/corporate-requests/route.ts",
  "../app/api/admin/customers/route.ts",
  "../app/api/admin/roles/route.ts",
  "../app/api/admin/shows/route.ts",
  "../app/api/admin/ticket-validations/route.ts",
  "../app/api/admin/tickets/route.ts",
  "../app/api/admin/venue-settings/route.ts",
  "../app/api/admin/waitlist/route.ts",
] as const;

function getHandlerSource(source: string, method: string) {
  const marker = `export async function ${method}`;
  const start = source.indexOf(marker);
  const next = source.indexOf("export async function ", start + marker.length);

  assert.notEqual(start, -1, `${method} handler is missing`);
  return source.slice(start, next === -1 ? source.length : next);
}

test("Admin data GET routes require active staff authentication", async () => {
  for (const path of protectedReadRoutes) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    const handler = getHandlerSource(source, "GET");

    assert.match(handler, /requireActiveStaff\(request\)/, path);
  }
});

test("legacy Admin persistence helpers require booking management access", async () => {
  for (const path of [
    "../app/api/admin/booking-lifecycle-events/route.ts",
    "../app/api/admin/corporate-requests/route.ts",
    "../app/api/admin/waitlist/route.ts",
  ]) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");

    assert.match(source, /requireActiveStaff\(request\)/, path);
    assert.match(source, /bookings:manage/, path);
  }
});

test("customer writes require active staff and existing edit authority", async () => {
  const source = await readFile(
    new URL("../app/api/admin/customers/route.ts", import.meta.url),
    "utf8",
  );

  for (const method of ["POST", "PATCH"]) {
    const handler = getHandlerSource(source, method);

    assert.match(handler, /requireActiveStaff\(request\)/, method);
    assert.match(handler, /canManageCustomerIdentity\(auth\.staffProfile\)/, method);
  }
});
