import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const migrationPath =
  "supabase/migrations/20260928170000_phase_41_2y_p0_c_corporate_expiry_mass_recovery.sql";

async function source(path: string) {
  return readFile(new URL(path, root), "utf8");
}

test("dry run uses immutable automated-expiry provenance and deterministic ordering", async () => {
  const sql = await source(migrationPath);
  assert.match(sql, /preview_corporate_expiry_mass_recovery/);
  assert.match(sql, /corporate\.payment_deadline\.expired/);
  assert.match(sql, /order by booking\.created_at, expiry\.created_at, booking\.id/);
  assert.match(sql, /restore_now/);
  assert.match(sql, /capacity_blocked/);
  assert.match(sql, /duplicate_replacement_review/);
  assert.match(sql, /ineligible_manual_or_restricted/);
});

test("manual cancellations, refunds, archives, and likely replacements fail closed", async () => {
  const sql = await source(migrationPath);
  assert.match(sql, /later_action\.action in \([\s\S]*'booking\.cancel'/);
  assert.match(sql, /payment_refunds[\s\S]+completed_at is not null/);
  assert.match(sql, /archived_at is not null/);
  assert.match(sql, /CORPORATE_EXPIRY_RECOVERY_DUPLICATE_REVIEW/);
  assert.match(sql, /legitimate_separate_bookings/);
});

test("capacity is validated per zone and reserves earlier dry-run recoveries", async () => {
  const sql = await source(migrationPath);
  assert.match(sql, /booking_capacity_zone_state/);
  assert.match(sql, /effective_operational_capacity/);
  assert.match(sql, /v_reserved/);
  assert.match(sql, /earlier_recovery_pax/);
  assert.match(sql, /CORPORATE_EXPIRY_RECOVERY_CAPACITY_EXCEEDED/);
  assert.doesNotMatch(sql, /assign_unallocated_booking_table_atomic/);
});

test("atomic recovery preserves booking identity and truthful financial state", async () => {
  const sql = await source(migrationPath);
  const recovery = sql.slice(
    sql.indexOf("create or replace function public.recover_system_expired_corporate_booking_atomic"),
  );
  assert.doesNotMatch(recovery, /insert into public\.bookings/);
  assert.doesNotMatch(recovery, /insert into public\.payments/);
  assert.match(recovery, /payment_status::text in \('fully_paid', 'comp_vip'\)/);
  assert.match(recovery, /amount_paid, 0\) >= coalesce\(v_booking\.total_amount/);
  assert.match(recovery, /else 'pending_payment'::public\.booking_status/);
  assert.match(recovery, /amount_paid/);
  assert.match(recovery, /balance_outstanding/);
  assert.match(recovery, /table_id = null/);
});

test("recovery is locked, stale-safe, idempotent, and audited", async () => {
  const sql = await source(migrationPath);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /for update/);
  assert.match(sql, /BOOKING_REVISION_CHANGED/);
  assert.match(sql, /request_id = trim\(p_request_id\)/);
  assert.match(sql, /corporate\.booking\.expiry-recovered/);
  assert.match(sql, /booking_lifecycle_events/);
});

test("existing tickets are reactivated without creating duplicate identities", async () => {
  const sql = await source(migrationPath);
  assert.match(sql, /update public\.tickets/);
  assert.doesNotMatch(sql, /insert into public\.tickets/);
  assert.match(sql, /ticket_status = case when ticket_status = 'cancelled' then 'valid'/);
});

test("scheduler protection retains expiry provenance and seven-day policy", async () => {
  const sql = await source(migrationPath);
  assert.doesNotMatch(sql, /corporate_payment_expired_at = null/);
  assert.match(sql, /corporate_payment_expired_at', v_booking\.corporate_payment_expired_at/);
  assert.doesNotMatch(sql, /durationDays/);
  assert.doesNotMatch(sql, /expire_unpaid_public_booking/);
});

test("recovery functions remain service-role only", async () => {
  const sql = await source(migrationPath);
  assert.match(sql, /revoke all on function public\.preview_corporate_expiry_mass_recovery\(\)[\s\S]+from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.preview_corporate_expiry_mass_recovery\(\)[\s\S]+to service_role/);
  assert.match(sql, /revoke all on function public\.recover_system_expired_corporate_booking_atomic[\s\S]+from public, anon, authenticated/);
});

test("existing late-EFT and ordinary reinstatement paths remain intact", async () => {
  const p0a = await source(
    "supabase/migrations/20260928150000_phase_41_2y_p0_a_corporate_late_eft_reinstatement.sql",
  );
  assert.match(p0a, /record_expired_corporate_payment_atomic/);
  assert.match(p0a, /reinstate_expired_corporate_booking_atomic/);
  assert.match(p0a, /CORPORATE_REINSTATEMENT_PAYMENT_REQUIRED/);
});
