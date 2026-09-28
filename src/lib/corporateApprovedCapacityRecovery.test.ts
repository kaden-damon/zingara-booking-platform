import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const migrationPath =
  "supabase/migrations/20260928180000_phase_41_2y_p0_e_approved_capacity_recovery.sql";

async function migration() {
  return readFile(new URL(migrationPath, root), "utf8");
}

test("approved capacity is seat capacity and never fabricates tables or claims", async () => {
  const sql = await migration();
  assert.match(sql, /show_zone_operational_capacity_adjustments/);
  assert.doesNotMatch(sql, /insert into public\.show_tables/);
  assert.doesNotMatch(sql, /insert into public\.booking_table_claims/);
  assert.match(sql, /do not represent physical tables or public sellable inventory/i);
});

test("base and public sellable capacity remain unchanged", async () => {
  const sql = await migration();
  assert.match(sql, /capacity_context\.base_capacity - booking_totals\.active_entitlement_pax/);
  assert.match(sql, /base_capacity \+ totals\.temporary_capacity/);
  assert.doesNotMatch(sql, /update public\.venue/);
  assert.doesNotMatch(sql, /update public\.shows/);
});

test("the exact twelve bookings and approved maxima are bounded in the server function", async () => {
  const sql = await migration();
  const references = [
    "ZNG-HYHXVD", "ZNG-PJULVP", "ZNG-2SF9JY", "ZNG-GSU2SY",
    "ZNG-LXBL5T", "ZNG-MRUPD8", "ZNG-HA9LKS", "ZNG-C2CZNG",
    "ZNG-MMWLLC", "ZNG-JLDCP6", "ZNG-SQ9MNA", "ZNG-V5AX95",
  ];
  for (const reference of references) assert.match(sql, new RegExp(reference));

  const maxima = [...sql.matchAll(/'maximum', (\d+)/g)].map((match) => Number(match[1]));
  assert.equal(maxima.reduce((sum, value) => sum + value, 0), 141);
  assert.match(sql, /v_added > v_approved_maximum/);
  assert.match(sql, /APPROVED_CAPACITY_RECOVERY_REAPPROVAL_REQUIRED/);
});

test("live capacity is re-read under zone locks and only the remaining deficit is added", async () => {
  const sql = await migration();
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /booking_capacity_zone_state/);
  assert.match(sql, /greatest\([\s\S]+active_entitlement_pax \+ v_entitlement\.pax[\s\S]+effective_operational_capacity/);
  assert.match(sql, /if v_added > 0 then/);
});

test("original venue, date, pax, and zone allocations must still match approval", async () => {
  const sql = await migration();
  assert.match(sql, /APPROVED_CAPACITY_RECOVERY_BOOKING_CHANGED/);
  assert.match(sql, /APPROVED_CAPACITY_RECOVERY_ZONE_CHANGED/);
  assert.match(sql, /APPROVED_CAPACITY_RECOVERY_PAX_CHANGED/);
  assert.match(sql, /APPROVED_CAPACITY_RECOVERY_ZONE_SET_CHANGED/);
});

test("capacity addition and P0-C lifecycle recovery share one atomic transaction", async () => {
  const sql = await migration();
  assert.match(sql, /recover_system_expired_corporate_booking_atomic/);
  assert.match(sql, /corporate\.booking\.expiry-recovered/);
  assert.match(sql, /show\.zone-operational-capacity\.approved-added/);
  assert.doesNotMatch(sql, /insert into public\.bookings/);
  assert.doesNotMatch(sql, /insert into public\.payments/);
  assert.doesNotMatch(sql, /insert into public\.tickets/);
});

test("stale revisions, retries, and duplicate capacity additions fail safely", async () => {
  const sql = await migration();
  assert.match(sql, /BOOKING_REVISION_CHANGED/);
  assert.match(sql, /already_processed/);
  assert.match(sql, /unique \(booking_id, zone_id\)/);
  assert.match(sql, /unique \(request_id, booking_id, zone_id\)/);
});

test("new recovery surface remains service-role only", async () => {
  const sql = await migration();
  assert.match(sql, /revoke all on table[\s\S]+from public, anon, authenticated/);
  assert.match(sql, /revoke all on function public\.recover_approved_capacity_blocked_corporate_booking_atomic[\s\S]+from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.recover_approved_capacity_blocked_corporate_booking_atomic[\s\S]+to service_role/);
});
