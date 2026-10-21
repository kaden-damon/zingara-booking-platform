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

test("account discovery retrieves bank accounts separately and permits Account ID based payment mapping", async () => {
  const [adapter, discovery, route] = await Promise.all([
    source("src/lib/xero/accountingAdapter.ts"),
    source("src/lib/xero/discovery.ts"),
    source("src/app/api/admin/xero/mappings/route.ts"),
  ]);
  assert.match(adapter, /Accounts\?where=Type%3D%3D%22BANK%22/);
  assert.match(discovery, /account\.type === "BANK" \|\| account\.enablePaymentsToAccount/);
  assert.match(discovery, /!candidate\.code \|\| candidate\.code === input\.accountCode/);
  assert.match(route, /!isXeroPaymentMappingCategory\(category\) && !accountCode/);
});

test("discounts use each venue sales account while refunds retain the original-invoice policy", async () => {
  const [mappings, panel, operations] = await Promise.all([
    source("src/lib/xero/mappings.ts"),
    source("src/app/admin/XeroConnectionPanel.tsx"),
    source("src/lib/xero/operations.ts"),
  ]);
  assert.match(mappings, /discounts: "205"/);
  assert.match(mappings, /discounts: "205-01"/);
  assert.match(panel, /Original-invoice credit note/);
  assert.match(operations, /pending manual reconciliation/);
  assert.match(operations, /preserve the original invoice account and tax treatment/);
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
  assert.match(panel, /if \(!search\) return undefined/);
  assert.match(panel, /allocated later as part-payments/);
});
