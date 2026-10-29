import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../supabase/migrations/20261029223000_p0_norman_deposit_reallocation.sql",
  import.meta.url,
);
const platformOwnerMigrationUrl = new URL(
  "../../supabase/migrations/20261029235000_p0_platform_owner_norman_transfer.sql",
  import.meta.url,
);
const routeUrl = new URL(
  "../app/api/admin/payments/norman-deposit-transfer/route.ts",
  import.meta.url,
);
const componentUrl = new URL(
  "../app/admin/NormanDepositTransferAction.tsx",
  import.meta.url,
);
const paymentsRouteUrl = new URL(
  "../app/api/admin/payments/route.ts",
  import.meta.url,
);

test("Norman deposit transfer is management-approved, atomic and provider-preserving", async () => {
  const [migration, platformOwnerMigration] = await Promise.all([
    readFile(migrationUrl, "utf8"),
    readFile(platformOwnerMigrationUrl, "utf8"),
  ]);

  assert.match(migration, /3ac09b59-fc3f-4c6d-9bb3-8dd47a077188/);
  assert.match(migration, /ff96887e-bed8-43ec-884d-0ef8634e9f12/);
  assert.match(migration, /79a9090b-49d5-41f6-b1ca-e2bfcc96d75d/);
  assert.match(migration, /Management-approved transfer of existing deposit to replacement booking\./);
  assert.match(migration, /for update/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /idempotency_key uuid not null unique/);
  assert.match(migration, /payment_id uuid not null unique/);
  assert.match(migration, /payment_refunds/);
  assert.match(migration, /manual_payment_reversals/);
  assert.match(migration, /xero_sync_outbox/);
  assert.match(migration, /set booking_id = v_target\.id/);
  assert.match(migration, /booking\.payment-reallocation-out/);
  assert.match(migration, /booking\.payment-reallocation-in/);
  assert.doesNotMatch(migration, /provider_transaction_id\s*=/);
  assert.doesNotMatch(migration, /delete from public\.(payments|bookings)/i);
  assert.match(platformOwnerMigration, /platform_owner_bindings/);
  assert.match(platformOwnerMigration, /owner\.auth_user_id = staff\.user_id/);
  assert.match(platformOwnerMigration, /role\.name = 'Super Admin'/);
  assert.doesNotMatch(platformOwnerMigration, /provider_transaction_id\s*=/);
  assert.doesNotMatch(platformOwnerMigration, /delete from public\.(payments|bookings)/i);
});

test("API requires authenticated explicit confirmation and the UI does not auto-submit", async () => {
  const [route, component] = await Promise.all([
    readFile(routeUrl, "utf8"),
    readFile(componentUrl, "utf8"),
  ]);

  assert.match(route, /requireActiveStaff/);
  assert.match(route, /body\?\.confirmed !== true/);
  assert.match(route, /auth\.staffProfile\.id === fatimaStaffProfileId/);
  assert.match(route, /auth\.user\?\.id === fatimaAuthUserId/);
  assert.match(route, /hasPlatformOwnerBinding\(auth\.staffProfile, auth\.user\)/);
  assert.match(route, /79a9090b-49d5-41f6-b1ca-e2bfcc96d75d/);
  assert.match(component, /I approve this management exception and payment transfer\./);
  assert.match(component, /disabled=\{!approved \|\| submitting\}/);
  const statusEffect = component.slice(
    component.indexOf("useEffect(() =>"),
    component.indexOf("async function transferDeposit"),
  );
  assert.doesNotMatch(statusEffect, /method: "POST"/);
});

test("booking payment reads preserve provider references while following reallocation", async () => {
  const route = await readFile(paymentsRouteUrl, "utf8");

  assert.match(route, /\.in\("reference", references\)/);
  assert.match(route, /\.in\("booking_id", bookingIds\)/);
  assert.match(route, /new Map<\s*string/);
});
