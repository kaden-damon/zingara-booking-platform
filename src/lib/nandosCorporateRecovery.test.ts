import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20260909120000_phase_41_1s_nandos_corporate_recovery.sql",
    import.meta.url,
  ),
  "utf8",
);

test("recovery preserves the reviewed financial model", () => {
  const pax = 22;
  const ticketObligation = 1_540 * pax;
  const barTab = 500 * pax;
  const subtotal = ticketObligation + barTab;
  const serviceFee = subtotal * 0.125;

  assert.equal(ticketObligation, 33_880);
  assert.equal(barTab, 11_000);
  assert.equal(subtotal, 44_880);
  assert.equal(serviceFee, 5_610);
  assert.equal(subtotal + serviceFee, 50_490);
  assert.equal(550 * pax, 12_100);
  assert.match(migration, /'quantity', 22[\s\S]*'unitPrice', 500[\s\S]*'price', 11000/);
  assert.match(migration, /12100, v_booking_id[\s\S]*'pending_payment', 'deposit'/);
});

test("recovery is service-role-only, dry-runnable and idempotent", () => {
  assert.match(migration, /p_dry_run boolean default true/);
  assert.match(migration, /NANDOS_RECOVERY_IDEMPOTENCY_CONFLICT/);
  assert.match(migration, /'status', 'already_complete'/);
  assert.match(
    migration,
    /revoke all on function public\.recover_nandos_corporate_booking_atomic\(uuid,uuid,boolean\)[\s\S]*public, anon, authenticated/,
  );
  assert.match(
    migration,
    /grant execute on function public\.recover_nandos_corporate_booking_atomic\(uuid,uuid,boolean\)[\s\S]*service_role/,
  );
});

test("capacity replacement is atomic and retains both holds on failure", () => {
  const insertIndex = migration.indexOf("insert into public.bookings (");
  const holdArchiveIndex = migration.indexOf("for v_hold in");
  const activateIndex = migration.indexOf("set booking_status = 'pending_payment'");

  assert.ok(insertIndex > 0);
  assert.ok(holdArchiveIndex > insertIndex);
  assert.ok(activateIndex > holdArchiveIndex);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /for update/);
  assert.match(migration, /v_other_active_pax \+ 22 > v_capacity/);
  assert.doesNotMatch(migration, /exception when/);
});

test("recovery reuses Timika and preserves forensic and operational metadata", () => {
  assert.match(migration, /b1cab7c7-7f7b-49a0-9930-9ee9a462257d/);
  assert.match(migration, /timikas@nandosgroup\.com/);
  assert.doesNotMatch(migration, /insert into public\.customers/);
  assert.doesNotMatch(migration, /insert into public\.corporate_requests/);
  assert.match(migration, /CORP-MTLK49MW-343/);
  assert.match(migration, /no historical deletion attribution made/);
  assert.match(migration, /Arrival Drinks \(unavailable for new selection/);
  assert.match(migration, /Vegan; Vegetarian; Gluten Free; Strict Halaal/);
});

test("recovery creates no ticket, payment link, communication or PayFast evidence", () => {
  assert.doesNotMatch(migration, /insert into public\.tickets/);
  assert.doesNotMatch(migration, /insert into public\.booking_payment_links/);
  assert.doesNotMatch(migration, /insert into public\.communications/);
  assert.doesNotMatch(migration, /provider_transaction_id\s*\)/);
  assert.match(migration, /'provider_transaction_id', null/);
  assert.match(migration, /Checkout not initiated/);
});

test("cancelled Corporate duplicate is validated but never revived", () => {
  assert.match(migration, /ZNG-GV4CWT/);
  assert.match(migration, /booking_status::text = 'cancelled'/);
  assert.match(
    migration,
    /select \* into v_cancelled_duplicate[\s\S]*booking_reference = 'ZNG-GV4CWT'[\s\S]*NANDOS_RECOVERY_CANCELLED_DUPLICATE_CHANGED/,
  );
});
