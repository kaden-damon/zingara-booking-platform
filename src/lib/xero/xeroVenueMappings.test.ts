import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../../", import.meta.url);
const source = (path: string) => readFile(new URL(path, root), "utf8");

test("venue mapping migration is additive, unique and atomically audited", async () => {
  const migration = await source("supabase/migrations/20261019180000_phase_50_4a_xero_venue_mappings.sql");
  assert.match(migration, /add column if not exists venue text not null default 'all'/);
  assert.match(migration, /xero_account_mappings\(tenant_id, venue, category\)/);
  assert.match(migration, /approve_xero_account_mapping_atomic/);
  assert.match(migration, /xero_account_mapping_approved/);
  assert.match(migration, /insert into public\.audit_events/);
});

test("document queue lookup is venue authoritative and has no global revenue fallback", async () => {
  const route = await source("src/app/api/admin/xero/route.ts");
  assert.match(route, /\.eq\("venue", current\.venue\)\.eq\("category", category\)/);
  assert.doesNotMatch(route, /eq\("venue", current\.venue\)[\s\S]{0,300}\.or\(/);
});

test("mapping API verifies live Xero identity before atomic approval", async () => {
  const route = await source("src/app/api/admin/xero/mappings/route.ts");
  assert.match(route, /normaliseXeroDiscovery\(await adapter\.discover\(\)\)/);
  assert.match(route, /verifiedXeroMapping/);
  assert.match(route, /Zingara Productions \(Pty\) Ltd/);
  assert.match(route, /approve_xero_account_mapping_atomic/);
  assert.match(route, /xeroCategoriesForVenue/);
  assert.match(route, /expectedXeroAccountCode/);
  assert.match(route, /isXeroMappingApprovalSupported/);
});

test("mapping UI separates PayFast from EFT and explains deposit part-payments", async () => {
  const [panel, mappings] = await Promise.all([
    source("src/app/admin/XeroConnectionPanel.tsx"),
    source("src/lib/xero/mappings.ts"),
  ]);
  assert.match(mappings, /payfast_clearing_account/);
  assert.match(mappings, /eft_payment_account/);
  assert.match(panel, /PayFast Clearing/);
  assert.match(panel, /Manual EFT Bank/);
  assert.match(panel, /allocated later as part-payments/);
});
