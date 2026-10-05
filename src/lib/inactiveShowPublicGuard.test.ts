import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  isShowPubliclyBookable,
  isShowPubliclyVisible,
  isShowStaffBookable,
} from "./publicShowSales.ts";

const originalGuardMigrationUrl = new URL(
  "../../supabase/migrations/20260928190000_phase_41_2y_p0_i_inactive_show_public_guard.sql",
  import.meta.url,
);
const specialEventBoundaryMigrationUrl = new URL(
  "../../supabase/migrations/20261005130000_special_event_public_booking_boundary.sql",
  import.meta.url,
);

test("public show lifecycle permits only active sales", () => {
  assert.equal(isShowPubliclyBookable("active"), true);
  for (const status of [
    "inactive",
    "archived",
    "blackout",
    "sold_out",
    "special_event",
    "special-event",
    "venue_closure",
  ]) {
    assert.equal(isShowPubliclyBookable(status), false);
  }
  assert.equal(isShowPubliclyVisible("inactive"), false);
  assert.equal(isShowPubliclyVisible("archived"), false);
  assert.equal(isShowPubliclyVisible("special_event"), false);
  assert.equal(isShowPubliclyVisible("special-event"), false);
  assert.equal(isShowPubliclyVisible("blackout"), true);
  assert.equal(isShowPubliclyVisible("sold_out"), true);
  assert.equal(isShowPubliclyVisible("venue_closure"), true);
});

test("staff booking lifecycle permits operational sales statuses only", () => {
  for (const status of [
    "active",
    "sold_out",
    "sold-out",
    "special_event",
    "special-event",
  ]) {
    assert.equal(isShowStaffBookable(status), true);
  }
  for (const status of ["archived", "blackout", "inactive", "venue_closure"]) {
    assert.equal(isShowStaffBookable(status), false);
  }
});

test("public listing, availability and creation share the lifecycle predicate", async () => {
  const [showsRoute, availability, bookingRoute] = await Promise.all([
    readFile(new URL("../app/api/shows/route.ts", import.meta.url), "utf8"),
    readFile(new URL("./supabase/publicShowAvailability.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/bookings/route.ts", import.meta.url), "utf8"),
  ]);

  assert.match(showsRoute, /isShowPubliclyVisible\(show\.status\)/);
  assert.match(showsRoute, /isShowStaffBookable\(show\.status\)/);
  assert.match(showsRoute, /requireActiveStaff\(request\)/);
  assert.match(showsRoute, /includes\("bookings:manage"\)/);
  assert.match(availability, /isShowPubliclyBookable\(showStatuses\.get\(showId\)\)/);
  assert.match(availability, /showPubliclyBookable &&/);
  assert.match(bookingRoute, /!isShowPubliclyBookable\(show\.status\)/);
  assert.match(bookingRoute, /code: "SHOW_NOT_AVAILABLE"/);
  assert.match(bookingRoute, /select\("id,date,time,notes,status,venue"\)/);
});

test("authenticated staff and Corporate paths retain special-event booking access", async () => {
  const [bookingPage, corporateModal, corporateRoute, adminPage] =
    await Promise.all([
      readFile(new URL("../app/book/page.tsx", import.meta.url), "utf8"),
      readFile(
        new URL("../app/admin/CorporateConversionModal.tsx", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL(
          "../app/api/admin/corporate-requests/convert/route.ts",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(new URL("../app/admin/page.tsx", import.meta.url), "utf8"),
    ]);

  assert.match(bookingPage, /isStaffBookableShow\(lockedShow\)/);
  assert.match(
    bookingPage,
    /getPublicShows\(\{ operational: Boolean\(calendarBookingContext\) \}\)/,
  );
  assert.match(
    corporateModal,
    /\["active", "sold-out", "special-event"\]/,
  );
  assert.match(
    corporateRoute,
    /\["active", "special_event", "sold_out"\]/,
  );
  assert.match(adminPage, /!isShowStaffBookable\(status\)/);
});

test("both final database reservation boundaries lock and validate public show status", async () => {
  const [originalGuardMigration, specialEventBoundaryMigration] =
    await Promise.all([
      readFile(originalGuardMigrationUrl, "utf8"),
      readFile(specialEventBoundaryMigrationUrl, "utf8"),
    ]);

  assert.match(specialEventBoundaryMigration, /from public\.shows[\s\S]*for update/);
  assert.match(specialEventBoundaryMigration, /v_show_status <> 'active'/);
  assert.match(specialEventBoundaryMigration, /raise exception 'SHOW_NOT_AVAILABLE'/);
  assert.match(specialEventBoundaryMigration, /booking_origin'[\s\S]*customer_public/);
  assert.match(specialEventBoundaryMigration, /booking_source'[\s\S]*online/);
  assert.match(originalGuardMigration, /create function public\.reserve_public_booking_entitlement\(/);
  assert.match(originalGuardMigration, /create function public\.reserve_public_booking_table\(/);
  assert.equal(
    (originalGuardMigration.match(
      /perform public\.assert_new_public_booking_show_available\(/g,
    ) ?? []).length,
    3,
  );
  assert.match(originalGuardMigration, /before insert on public\.bookings/);
  assert.match(originalGuardMigration, /if not exists \([\s\S]*booking_reference/);
});

test("unguarded implementations remain inaccessible to public API roles", async () => {
  const migration = await readFile(originalGuardMigrationUrl, "utf8");

  assert.match(
    migration,
    /reserve_public_booking_entitlement_unguarded_41_2y[\s\S]*from public, anon, authenticated, service_role/,
  );
  assert.match(
    migration,
    /reserve_public_booking_table_unguarded_41_2y[\s\S]*from public, anon, authenticated, service_role/,
  );
});

test("existing payment settlement and Admin transfer functions are untouched", async () => {
  const migration = await readFile(specialEventBoundaryMigrationUrl, "utf8");

  assert.doesNotMatch(migration, /prepare_payfast_checkout_attempt|payments|tickets|communications/);
  assert.doesNotMatch(migration, /transfer_booking_show_atomic/);
  assert.doesNotMatch(migration, /update public\.bookings|delete from public\.bookings/);
});
