import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readMigration = (name: string) => readFileSync(
  new URL(`../../supabase/migrations/${name}`, import.meta.url), "utf8",
);
const original = readMigration("20261106030000_phase_3_multi_zone_split_payments.sql");
const correction = readMigration("20261119090000_p0_split_allocation_provenance.sql");
const functionBody = (sql: string) => {
  const match = sql.match(/create or replace function public\.reserve_staff_guest_allocations\([\s\S]*?\n\$\$;/);
  assert.ok(match, "staff allocation function must be present");
  return match[0];
};

test("the correction changes only provenance precedence, preserving all transactional guards", () => {
  assert.equal(functionBody(correction), functionBody(original).replace(
    "provenance_recorded_at = coalesce(\n",
    "provenance_recorded_at = coalesce(\n           v_booking.provenance_recorded_at,\n",
  ));
});

test("the migration remains function-only and service-role-only", () => {
  assert.doesNotMatch(correction, /alter table|disable trigger|drop trigger|delete from|exception when/i);
  assert.match(correction, /revoke all[\s\S]*from public, anon, authenticated/);
  assert.match(correction, /grant execute[\s\S]*to service_role/);
  const trigger = readMigration("20260828140000_phase_39_11_booking_provenance.sql");
  assert.match(trigger, /new\.provenance_recorded_at is distinct from old\.provenance_recorded_at/);
});

test("linked verification is explicitly opt-in and always rollback-only", () => {
  const runner = readFileSync(new URL("../../scripts/verify-split-allocation-provenance.mjs", import.meta.url), "utf8");
  assert.match(runner, /--original.*--candidate.*--deployed/);
  assert.match(runner, /begin;/);
  assert.match(runner, /rollback;/);
  assert.doesNotMatch(runner, /commit;/i);
});
