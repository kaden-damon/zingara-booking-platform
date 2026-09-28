import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  isShowPubliclyBookable,
  isShowPubliclyVisible,
} from "./publicShowSales.ts";

const migrationUrl = new URL(
  "../../supabase/migrations/20260928190000_phase_41_2y_p0_i_inactive_show_public_guard.sql",
  import.meta.url,
);

test("public show lifecycle permits only active and special-event sales", () => {
  assert.equal(isShowPubliclyBookable("active"), true);
  assert.equal(isShowPubliclyBookable("special_event"), true);
  assert.equal(isShowPubliclyBookable("special-event"), true);
  for (const status of [
    "inactive",
    "archived",
    "blackout",
    "sold_out",
    "venue_closure",
  ]) {
    assert.equal(isShowPubliclyBookable(status), false);
  }
  assert.equal(isShowPubliclyVisible("inactive"), false);
  assert.equal(isShowPubliclyVisible("archived"), false);
  assert.equal(isShowPubliclyVisible("sold_out"), true);
});

test("public listing, availability and creation share the lifecycle predicate", async () => {
  const [showsRoute, availability, bookingRoute] = await Promise.all([
    readFile(new URL("../app/api/shows/route.ts", import.meta.url), "utf8"),
    readFile(new URL("./supabase/publicShowAvailability.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/bookings/route.ts", import.meta.url), "utf8"),
  ]);

  assert.match(showsRoute, /isShowPubliclyVisible\(show\.status\)/);
  assert.match(availability, /isShowPubliclyBookable\(showStatuses\.get\(showId\)\)/);
  assert.match(availability, /showPubliclyBookable &&/);
  assert.match(bookingRoute, /!isShowPubliclyBookable\(show\.status\)/);
  assert.match(bookingRoute, /code: "SHOW_NOT_AVAILABLE"/);
  assert.match(bookingRoute, /select\("id,date,time,notes,status,venue"\)/);
});

test("both final database reservation boundaries lock and validate public show status", async () => {
  const migration = await readFile(migrationUrl, "utf8");

  assert.match(migration, /from public\.shows[\s\S]*for update/);
  assert.match(migration, /not in \('active', 'special_event'\)/);
  assert.match(migration, /raise exception 'SHOW_NOT_AVAILABLE'/);
  assert.match(migration, /create function public\.reserve_public_booking_entitlement\(/);
  assert.match(migration, /create function public\.reserve_public_booking_table\(/);
  assert.equal((migration.match(/perform public\.assert_new_public_booking_show_available\(/g) ?? []).length, 3);
  assert.match(migration, /booking_origin'[\s\S]*customer_public/);
  assert.match(migration, /booking_source'[\s\S]*online/);
  assert.match(migration, /before insert on public\.bookings/);
  assert.match(migration, /if not exists \([\s\S]*booking_reference/);
});

test("unguarded implementations are inaccessible to public API roles", async () => {
  const migration = await readFile(migrationUrl, "utf8");

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
  const migration = await readFile(migrationUrl, "utf8");

  assert.doesNotMatch(migration, /prepare_payfast_checkout_attempt|payments|tickets|communications/);
  assert.doesNotMatch(migration, /transfer_booking_show_atomic/);
  assert.doesNotMatch(migration, /update public\.bookings|delete from public\.bookings/);
});
