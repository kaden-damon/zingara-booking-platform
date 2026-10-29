import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("public booking remains active-only while trusted staff use the internal policy", async () => {
  const bookingRoute = await source("../app/api/bookings/route.ts");

  assert.match(bookingRoute, /!isShowPubliclyBookable\(show\.status\)/);
  assert.match(bookingRoute, /if \(isTrustedStaff\)[\s\S]*getInternalShowBookingDecision/);
  assert.match(bookingRoute, /rolePermissions\[staffRole\]\.includes\("bookings:reconcile"\)/);
  assert.match(bookingRoute, /isInternalShowApprovalReasonValid/);
});

test("calendar creation, Corporate conversion and transfers share approval policy", async () => {
  const [adminRoute, conversionRoute, bookingPage, adminPage] = await Promise.all([
    source("../app/api/admin/bookings/route.ts"),
    source("../app/api/admin/corporate-requests/convert/route.ts"),
    source("../app/book/page.tsx"),
    source("../app/admin/page.tsx"),
  ]);

  assert.match(adminRoute, /booking\.restricted-show-approved/);
  assert.match(adminRoute, /booking\.restricted-show-transfer-approved/);
  assert.match(conversionRoute, /\["active", "inactive", "special_event", "sold_out"\]/);
  assert.match(conversionRoute, /restrictedShowApprovalReason/);
  assert.match(bookingPage, /Management approval reason/);
  assert.match(adminPage, /CLOSED — INTERNAL BOOKINGS ALLOWED|internalShowDecision|selectedTransferDecision/);
});

test("guest reductions remain possible and increases fail closed on protected statuses", async () => {
  const route = await source("../app/api/admin/bookings/reconciliation/route.ts");

  assert.match(route, /Number\(body\.guestCount\) > Number\(bookingContext\.guest_count\)/);
  assert.match(route, /getInternalShowBookingDecision/);
  assert.match(route, /if \(!internalDecision\.allowed\)/);
});

test("transfer migration changes only the service-only status guard", async () => {
  const migration = await source(
    "../../supabase/migrations/20261030090000_phase_60_internal_booking_status.sql",
  );

  assert.match(migration, /pg_get_functiondef/);
  assert.match(migration, /''active'', ''inactive'', ''sold_out'', ''special_event''/);
  assert.match(migration, /from public, anon, authenticated/);
  assert.match(migration, /to service_role/);
  assert.doesNotMatch(migration, /update public\.(bookings|shows|show_tables|payments)/i);
});
