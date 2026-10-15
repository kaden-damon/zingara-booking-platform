import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const migrationPath =
  "supabase/migrations/20261015100000_p0_public_checkout_reinstatement_override.sql";

async function source(path: string) {
  return readFile(new URL(path, root), "utf8");
}

test("released booking reinstatement requires immutable cancellation and payment evidence", async () => {
  const sql = await source(migrationPath);
  assert.match(sql, /action in \('booking\.cancel', 'public_checkout\.hold\.expired'\)/);
  assert.match(sql, /legacy_booking_payment_evidence/);
  assert.match(sql, /source_payment_amount[\s\S]+amount_paid/);
  assert.match(sql, /payment_status::text in \('deposit_paid', 'fully_paid'\)/);
  assert.match(sql, /manual_payment_reversals/);
  assert.match(sql, /payment_refunds[\s\S]+completed_at is not null/);
});

test("proven unpaid public checkout expiries use the same guarded reinstatement workflow", async () => {
  const sql = await source(migrationPath);
  assert.match(sql, /action = 'public_checkout\.hold\.expired'/);
  assert.match(sql, /actor_name = 'SYSTEM'/);
  assert.match(sql, /booking_origin = 'customer_public'/);
  assert.match(sql, /booking_source = 'online'/);
  assert.match(sql, /public_checkout_superseded_by is null/);
  assert.match(sql, /archive_reason = 'Public payment hold expired'/);
  assert.match(sql, /not v_payment_evidence and not v_public_checkout_expiry/);
  assert.match(sql, /archived_at = case when v_public_checkout_expiry then null/);
  assert.match(sql, /unpaid_public_checkout_override/);
});

test("unpaid expiry reinstatement preserves financials and cannot create or reactivate tickets", async () => {
  const sql = await source(migrationPath);
  const atomic = sql.slice(sql.indexOf("create or replace function public.reinstate_released_booking_atomic"));
  assert.match(atomic, /ticket_status = 'cancelled'[\s\S]+and v_payment_evidence/);
  assert.doesNotMatch(atomic, /insert into public\.(payments|tickets)/i);
  assert.doesNotMatch(atomic, /amount_paid\s*=|balance_outstanding\s*=|total_amount\s*=/i);
  assert.match(atomic, /outstanding balance preserved and no ticket created/i);
});

test("reinstatement is permissioned, venue-scoped, stale-safe, locked and idempotent", async () => {
  const sql = await source(migrationPath);
  assert.match(sql, /permission\.key = 'bookings:manage'/);
  assert.match(sql, /SHOW_OUTSIDE_STAFF_SCOPE/);
  assert.match(sql, /pg_advisory_xact_lock\(hashtext\(upper/);
  assert.match(sql, /BOOKING_REVISION_CHANGED/);
  assert.match(sql, /request_id = trim\(p_idempotency_key\)/);
  assert.match(sql, /action = 'booking\.reinstated'/);
});

test("capacity is revalidated without creating tables or capacity", async () => {
  const sql = await source(migrationPath);
  assert.match(sql, /booking_capacity_zone_state/);
  assert.match(sql, /effective_operational_capacity/);
  assert.match(sql, /BOOKING_REINSTATEMENT_CAPACITY_EXCEEDED/);
  assert.doesNotMatch(sql, /insert into public\.show_tables|update public\.show_tables/i);
  assert.doesNotMatch(sql, /update public\.shows/i);
});

test("financials and identities are preserved while existing cancelled tickets are reactivated", async () => {
  const sql = await source(migrationPath);
  const atomic = sql.slice(sql.indexOf("create or replace function public.reinstate_released_booking_atomic"));
  assert.match(atomic, /set booking_status = 'confirmed',[\s\S]+updated_at = v_now/);
  assert.match(atomic, /update public\.tickets[\s\S]+ticket_status = 'valid'/);
  assert.doesNotMatch(atomic, /insert into public\.(bookings|payments|tickets)/i);
  assert.doesNotMatch(atomic, /amount_paid\s*=|balance_outstanding\s*=|total_amount\s*=/i);
  assert.doesNotMatch(atomic, /table_id\s*=/i);
  assert.match(atomic, /historical_performance/);
});

test("existing Corporate reinstatement remains the delegated path", async () => {
  const sql = await source(migrationPath);
  const route = await source("src/app/api/admin/bookings/reinstate-corporate/route.ts");
  assert.match(sql, /preview_expired_corporate_reinstatement/);
  assert.match(route, /reinstatement_type === "corporate_expiry"/);
  assert.match(route, /reinstate_expired_corporate_booking_atomic/);
  assert.match(route, /reinstate_released_booking_atomic/);
});

test("Booking Details exposes one confirmed reinstatement workflow without full-list reload", async () => {
  const page = await source("src/app/admin/page.tsx");
  const handler = page.slice(
    page.indexOf("async function confirmCorporateReinstatement"),
    page.indexOf("function openRefundBookingConfirmation"),
  );
  assert.match(page, /isReinstatementCandidate/);
  assert.match(page, /Reinstate Booking/);
  assert.match(page, /Confirm Reinstatement/);
  assert.match(page, /Confirm Unpaid Reinstatement/);
  assert.match(page, /public_checkout_expiry/);
  assert.match(handler, /refreshBookingInState\(booking\.reference\)/);
  assert.doesNotMatch(handler, /getBookings\(/);
  assert.doesNotMatch(handler, /sendZingaraGuest|ensureCommunication/);
});

test("reinstatement RPCs remain service-role only", async () => {
  const sql = await source(migrationPath);
  assert.match(sql, /revoke all on function public\.preview_booking_reinstatement\(text\)[\s\S]+from public, anon, authenticated/);
  assert.match(sql, /revoke all on function public\.reinstate_released_booking_atomic[\s\S]+from public, anon, authenticated/);
});
