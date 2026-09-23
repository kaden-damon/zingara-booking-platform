import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync(
  "supabase/migrations/20260923120000_phase_41_2t_booking_management.sql",
  "utf8",
);
const guestRoute = fs.readFileSync(
  "src/app/api/find-booking/manage/route.ts",
  "utf8",
);
const findRoute = fs.readFileSync("src/app/api/find-booking/route.ts", "utf8");
const wallet = fs.readFileSync("src/lib/appleWalletSync.ts", "utf8");

test("guest mutation requires reference and mobile and rejects non-Standard records", () => {
  assert.match(guestRoute, /!bookingReference \|\| !mobileNumber/);
  assert.match(guestRoute, /verifyBookingManagementMobile/);
  assert.match(migration, /booking_origin is distinct from 'customer_public'/);
  assert.match(migration, /booking_source is distinct from 'online'/);
  assert.match(migration, /corporate_request_id is not null/);
});

test("managed actions are stale-safe and idempotent", () => {
  assert.match(migration, /updated_at is distinct from p_expected_updated_at/);
  assert.match(migration, /raise exception 'BOOKING_CHANGED'/);
  assert.match(migration, /booking_status::text = 'cancelled'/);
  assert.match(migration, /show_id = p_destination_show_id/);
});

test("move uses public base capacity and public zone controls", () => {
  assert.match(migration, /v_state\.active_entitlement_pax \+ v_booking\.guest_count > v_state\.base_capacity/);
  assert.match(migration, /show_zone_sales_controls/);
  assert.match(migration, /seating_zone_is_enabled/);
  assert.match(guestRoute, /loadPublicShowAvailabilityBatch/);
});

test("cancellation releases Floor claims, cancels tickets and revokes links exactly in the transaction", () => {
  assert.match(migration, /update public\.show_tables/);
  assert.match(migration, /update public\.tickets/);
  assert.match(migration, /update public\.booking_payment_links/);
  assert.match(migration, /insert into public\.booking_lifecycle_events/);
  assert.match(migration, /insert into public\.audit_events/);
});

test("move preserves financial and identity fields while clearing old-show Floor claims", () => {
  const moveBody = migration.slice(migration.indexOf("move_public_standard_booking_atomic"));
  assert.match(moveBody, /update public\.show_tables/);
  assert.match(moveBody, /set show_id = v_destination\.id, table_id = null/);
  assert.doesNotMatch(moveBody, /update public\.booking_payment_links/);
  assert.doesNotMatch(moveBody, /set[^;]*total_amount\s*=/);
  assert.doesNotMatch(moveBody, /set[^;]*amount_paid\s*=/);
  assert.doesNotMatch(moveBody, /update public\.tickets/);
});

test("Find My Booking eligibility is server-derived and Wallet updates reuse existing identity flow", () => {
  assert.match(findRoute, /isGuestManageableStandardBooking/);
  assert.match(guestRoute, /notifyAppleWalletBooking/);
  assert.match(wallet, /bookingId/);
  assert.doesNotMatch(guestRoute, /serialNumber|qr_payload|ticket_code/);
});

test("move candidate hydration is batched with no per-show query loop", () => {
  const availability = fs.readFileSync(
    "src/lib/supabase/publicShowAvailability.ts",
    "utf8",
  );
  assert.match(availability, /\.in\("show_id", uniqueShowIds\)/);
  assert.doesNotMatch(guestRoute, /for \([^)]*show[^)]*\)[\s\S]{0,300}await/);
});
